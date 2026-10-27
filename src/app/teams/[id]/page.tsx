import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Header from "@/components/Header";
import { sql } from "@/lib/db";
import { getCurrentUser, getLang } from "@/lib/session";
import { wt, type WebKey } from "@/lib/web-i18n";
import { weekdayShort } from "@/bot/format";
import { LOCALES, type Lang } from "@/bot/i18n";
import { loadSeatsMany, splitSeats, type Seat } from "@/lib/seats";
import TeamCalendar, { type CalItem, type CalKind } from "@/components/TeamCalendar";
import { createEventAction, deleteEventAction } from "./event-actions";
import {
  addGuestsAction,
  addScheduleAction,
  answerAction,
  cancelTrainingAction,
  createTrainingAction,
  deleteSlotAction,
  removeGuestAction,
  removeMemberAction,
  setOrganizerAction,
  togglePlaysAction,
  updateTimingAction,
} from "./actions";

export const dynamic = "force-dynamic";

// Сообщения после действий: код из адреса → текст и цвет
const NOTICES: Record<string, { key: WebKey; ok: boolean }> = {
  saved: { key: "n_saved", ok: true },
  created: { key: "n_created", ok: true },
  cancelled: { key: "n_cancelled", ok: true },
  sched_ok: { key: "n_sched_ok", ok: true },
  sched_nogroup: { key: "n_sched_nogroup", ok: true },
  slot_deleted: { key: "n_slot_deleted", ok: true },
  err: { key: "n_err", ok: false },
  format: { key: "n_format", ok: false },
  baddate: { key: "n_baddate", ok: false },
  nodate: { key: "n_nodate", ok: false },
  nogroup: { key: "n_nogroup", ok: false },
  postfail: { key: "n_postfail", ok: false },
  past: { key: "n_past", ok: false },
  was_cancelled: { key: "n_was_cancelled", ok: false },
  timing_ok: { key: "n_timing_ok", ok: true },
  timing_bad: { key: "n_timing_bad", ok: false },
  in: { key: "n_in", ok: true },
  queue: { key: "n_queue", ok: true },
  out: { key: "n_out", ok: true },
  later_saved: { key: "n_later", ok: true },
  member_removed: { key: "n_member_removed", ok: true },
  org_added: { key: "n_org_added", ok: true },
  org_removed: { key: "n_org_removed", ok: true },
  plays_on: { key: "n_plays_on", ok: true },
  plays_off: { key: "n_plays_off", ok: true },
  owner_only: { key: "n_owner_only", ok: false },
  self: { key: "n_self", ok: false },
  guests_in: { key: "n_guests_in", ok: true },
  guests_queue: { key: "n_guests_queue", ok: true },
  guest_removed: { key: "n_guest_removed", ok: true },
  guests_many: { key: "n_guests_many", ok: false },
  event_created: { key: "n_event_created", ok: true },
  event_deleted: { key: "n_event_deleted", ok: true },
};

// Части даты для «карточки-календаря»
function dateParts(date: Date, tz: string, lang: Lang) {
  const loc = LOCALES[lang];
  const f = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(loc, { ...o, timeZone: tz }).format(date);
  return {
    weekday: f({ weekday: "short" }),
    day: f({ day: "numeric" }),
    month: f({ month: "short" }),
    time: f({ hour: "2-digit", minute: "2-digit", hour12: false }),
  };
}

export default async function TeamPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ n?: string }>;
}) {
  const { id } = await props.params;
  const { n } = await props.searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!/^\d+$/.test(id)) notFound();
  const lang = await getLang(user);

  // Доступ только участникам этой команды
  const [team] = await sql`
    select tm.id, tm.name, tm.timezone, tm.created_by, tm.poll_hours_before, tm.remind_hours_before, m.role
    from teams tm join memberships m on m.team_id = tm.id
    where tm.id = ${id} and m.user_id = ${user.id}`;
  if (!team) notFound();
  const isAdmin = team.role === "admin";
  const isOwner = String(team.created_by) === String(user.id);

  const slots = await sql`
    select id, weekday, start_time, place, needed_players
    from schedules
    where team_id = ${team.id} and active
    order by weekday, start_time`;

  const trainings = await sql`
    select tr.id, tr.starts_at, tr.place, tr.needed_players,
      (select count(*)::int from rsvps r where r.training_id = tr.id and r.status = 'going') as going,
      (select count(*)::int from rsvps r where r.training_id = tr.id and r.status = 'not_going') as not_going,
      (select count(*)::int from rsvps r where r.training_id = tr.id and r.status = 'later') as later,
      (select count(*)::int from memberships m
         where m.team_id = tr.team_id and m.plays
           and not exists (select 1 from rsvps r where r.training_id = tr.id and r.user_id = m.user_id)
      ) as no_answer,
      (select status from rsvps r where r.training_id = tr.id and r.user_id = ${user.id}) as my_status
    from trainings tr
    where tr.team_id = ${team.id} and tr.starts_at > now() and tr.cancelled_at is null
    order by tr.starts_at
    limit 10`;

  // Места на каждую тренировку: участники и их гости по порядку нажатий
  const seatsByTraining = await loadSeatsMany(trainings.map((x) => String(x.id)));

  const members = isAdmin
    ? await sql`
        select u.id, u.first_name, u.username, m.role, m.plays
        from memberships m join users u on u.id = m.user_id
        where m.team_id = ${team.id}
        order by (m.role = 'admin') desc, u.first_name`
    : [];

  // ---------- Календарь: тренировки и события команды
  const tz = team.timezone as string;
  const dayKey = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const timeKey = (d: Date) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);

  const calTrainings = await sql`
    select tr.id, tr.starts_at, tr.place, tr.needed_players, tr.cancelled_at,
      (select status from rsvps r where r.training_id = tr.id and r.user_id = ${user.id}) as my_status
    from trainings tr
    where tr.team_id = ${team.id}
      and tr.starts_at > now() - interval '180 days' and tr.starts_at < now() + interval '400 days'
    order by tr.starts_at`;
  // Отменённые не показываем, но помним их время: расписание не должно «воскресить» их в календаре
  const calActive = calTrainings.filter((x) => !x.cancelled_at);
  const calSeats = await loadSeatsMany(calActive.map((x) => String(x.id)));

  // Если таблица событий ещё не создана (не выполнена миграция 012), календарь покажет только тренировки
  let calEvents: { id: string; kind: string; title: string; starts_at: Date; place: string | null; description: string | null }[] = [];
  try {
    calEvents = await sql`
      select id, kind, title, starts_at, place, description
      from events
      where team_id = ${team.id}
        and starts_at > now() - interval '180 days' and starts_at < now() + interval '400 days'
      order by starts_at`;
  } catch {
    calEvents = [];
  }

  const myCalLabel = (s: string | null) =>
    s === "going" ? wt(lang, "ans_going") : s === "not_going" ? wt(lang, "ans_not_going") : s === "later" ? wt(lang, "ans_later") : wt(lang, "ans_none");

  const calItems: CalItem[] = [
    ...calActive.map((tr): CalItem => {
      const cap = tr.needed_players ? Number(tr.needed_players) : 0;
      const { confirmed, queue } = splitSeats(calSeats[String(tr.id)] ?? [], cap);
      return {
        key: `t${tr.id}`,
        type: "training",
        kind: "training",
        day: dayKey(tr.starts_at),
        time: timeKey(tr.starts_at),
        title: "",
        place: tr.place ?? null,
        description: null,
        going: confirmed.length,
        cap: cap || undefined,
        free: cap ? Math.max(0, cap - confirmed.length) : undefined,
        queue: queue.length,
        my: myCalLabel(tr.my_status ?? null),
      };
    }),
    ...calEvents.map((ev): CalItem => ({
      key: `e${ev.id}`,
      type: "event",
      kind: "tournament",
      day: dayKey(ev.starts_at),
      time: timeKey(ev.starts_at),
      title: ev.title,
      place: ev.place,
      description: ev.description,
      eventId: String(ev.id),
    })),
  ];
  // Будущие тренировки по расписанию, которые бот ещё не создал (он создаёт их за 14 дней)
  const existingStamps = new Set(calTrainings.map((x) => `${dayKey(x.starts_at)} ${timeKey(x.starts_at)}`));
  const nowStamp = `${dayKey(new Date())} ${timeKey(new Date())}`;
  const [by, bm, bd] = dayKey(new Date()).split("-").map(Number);
  const plannedNote = wt(lang, "schedule_timing", { poll: team.poll_hours_before, remind: team.remind_hours_before });
  const plannedItems: CalItem[] = [];
  for (let i = 0; i <= 400; i++) {
    const dt = new Date(Date.UTC(by, bm - 1, bd + i));
    const isoDay = dt.getUTCDay() || 7; // 1 = понедельник ... 7 = воскресенье, как в расписании
    const day = dt.toISOString().slice(0, 10);
    for (const s of slots) {
      if (Number(s.weekday) !== isoDay) continue;
      const time = String(s.start_time).slice(0, 5);
      const stamp = `${day} ${time}`;
      if (stamp <= nowStamp || existingStamps.has(stamp)) continue;
      plannedItems.push({
        key: `p${s.id}-${day}`,
        type: "training",
        kind: "training",
        day,
        time,
        title: "",
        place: s.place ?? null,
        description: null,
        cap: s.needed_players ? Number(s.needed_players) : undefined,
        planned: true,
        note: plannedNote,
      });
    }
  }
  calItems.push(...plannedItems);

  const calKinds: CalKind[] = ["training", "tournament"];
  const calLabels = {
    hint: wt(lang, "cal_hint"),
    empty: wt(lang, "cal_empty"),
    prev: wt(lang, "cal_prev"),
    next: wt(lang, "cal_next"),
    going: wt(lang, "going"),
    free: wt(lang, "free_spots"),
    waitlist: wt(lang, "waitlist"),
    yourAnswer: wt(lang, "your_answer"),
    planned: wt(lang, "cal_planned"),
    places: wt(lang, "cal_places"),
    del: wt(lang, "cal_delete"),
    confirmDel: wt(lang, "cal_confirm_delete"),
    kinds: Object.fromEntries(calKinds.map((k) => [k, wt(lang, `kind_${k}` as WebKey)])) as Record<CalKind, string>,
  };

  const answerLabel = (s: string | null) =>
    s === "going" ? wt(lang, "ans_going") : s === "not_going" ? wt(lang, "ans_not_going") : wt(lang, "ans_none");
  const notice = n ? NOTICES[n] : undefined;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <Header lang={lang} next={`/teams/${id}`} userName={user.first_name} />
      <main className="container">
        <Link href="/dashboard" className="back">
          {wt(lang, "back")}
        </Link>

        <div className="team-head">
          <h1 className="page-title">{team.name}</h1>
          <span className={isAdmin ? "role is-admin" : "role"}>{isAdmin ? wt(lang, "role_admin") : wt(lang, "role_player")}</span>
        </div>

        {notice && (
          <div className={notice.ok ? "notice" : "notice notice-err"}>{wt(lang, notice.key)}</div>
        )}

        <section className="section">
          <div className="section-head">
            <h2 className="section-title">{wt(lang, "cal_title")}</h2>
          </div>
          <div className="card">
            <TeamCalendar
              items={calItems}
              locale={LOCALES[lang]}
              todayKey={dayKey(new Date())}
              teamId={String(team.id)}
              canEdit={isAdmin}
              deleteAction={deleteEventAction}
              labels={calLabels}
            />
          </div>
          {isAdmin && (
            <>
              <details className="panel">
                <summary className="btn btn-add">{wt(lang, "new_training")}</summary>
                <form action={createTrainingAction} className="form">
                  <input type="hidden" name="team" value={team.id} />
                  <div className="form-row">
                    <label className="field">
                      {wt(lang, "f_date")}
                      <input type="date" name="date" min={today} required />
                    </label>
                    <label className="field">
                      {wt(lang, "f_time")}
                      <input type="time" name="time" defaultValue="19:00" required />
                    </label>
                  </div>
                  <div className="form-row">
                    <label className="field">
                      {wt(lang, "f_need")}
                      <input type="number" name="need" min={0} max={999} defaultValue={12} />
                    </label>
                    <label className="field">
                      {wt(lang, "f_place")}
                      <input type="text" name="place" maxLength={100} />
                    </label>
                  </div>
                  <div>
                    <button type="submit" className="btn btn-primary">
                      {wt(lang, "f_create")}
                    </button>
                  </div>
                </form>
              </details>
              <details className="panel">
                <summary className="btn btn-add">{wt(lang, "cal_add_tournament")}</summary>
                <form action={createEventAction} className="form">
                  <input type="hidden" name="team" value={team.id} />
                  <label className="field">
                    {wt(lang, "cal_f_title")}
                    <input type="text" name="title" maxLength={120} required />
                  </label>
                  <div className="form-row">
                    <label className="field">
                      {wt(lang, "f_date")}
                      <input type="date" name="date" required />
                    </label>
                    <label className="field">
                      {wt(lang, "f_time")}
                      <input type="time" name="time" defaultValue="10:00" required />
                    </label>
                  </div>
                  <label className="field">
                    {wt(lang, "f_place")}
                    <input type="text" name="place" maxLength={100} />
                  </label>
                  <label className="field">
                    {wt(lang, "cal_f_desc")}
                    <textarea name="description" rows={3} maxLength={1000} />
                  </label>
                  <div>
                    <button type="submit" className="btn btn-primary">
                      {wt(lang, "cal_f_add")}
                    </button>
                  </div>
                </form>
              </details>
            </>
          )}
        </section>

        <section className="section">
          <div className="section-head">
            <h2 className="section-title">{wt(lang, "upcoming")}</h2>
            {trainings.length > 0 && <span className="section-count">{trainings.length}</span>}
          </div>

          {isAdmin && (
            <details className="panel">
              <summary className="btn btn-add">{wt(lang, "new_training")}</summary>
              <form action={createTrainingAction} className="form">
                <input type="hidden" name="team" value={team.id} />
                <div className="form-row">
                  <label className="field">
                    {wt(lang, "f_date")}
                    <input type="date" name="date" min={today} required />
                  </label>
                  <label className="field">
                    {wt(lang, "f_time")}
                    <input type="time" name="time" defaultValue="19:00" required />
                  </label>
                </div>
                <div className="form-row">
                  <label className="field">
                    {wt(lang, "f_need")}
                    <input type="number" name="need" min={0} max={999} defaultValue={12} />
                  </label>
                  <label className="field">
                    {wt(lang, "f_place")}
                    <input type="text" name="place" maxLength={100} />
                  </label>
                </div>
                <div>
                  <button type="submit" className="btn btn-primary">
                    {wt(lang, "f_create")}
                  </button>
                </div>
              </form>
            </details>
          )}

          {trainings.length === 0 ? (
            <div className="card empty">{wt(lang, "no_upcoming")}</div>
          ) : (
            <div className="stack">
              {trainings.map((tr) => {
                const p = dateParts(tr.starts_at, team.timezone, lang);
                const cap = tr.needed_players ? Number(tr.needed_players) : 0;
                const seats = seatsByTraining[String(tr.id)] ?? [];
                const { confirmed, queue } = splitSeats(seats, cap);
                const myIdx = seats.findIndex((s) => s.key === `h:${user.id}`);
                const myQueuePos = cap && myIdx >= cap ? myIdx - cap + 1 : 0;
                const myGuests = seats.filter((s) => s.hostId === String(user.id) && s.guestId);
                const pct = cap ? Math.min(100, Math.round((confirmed.length / cap) * 100)) : 0;
                const seatLabel = (s: Seat) =>
                  s.guestId
                    ? wt(lang, "seat_guest", { name: s.name || wt(lang, "guest_unnamed"), host: s.hostName })
                    : s.name;
                const myLabel =
                  tr.my_status === "going"
                    ? myQueuePos > 0
                      ? wt(lang, "ans_queue", { n: myQueuePos })
                      : wt(lang, "ans_going")
                    : tr.my_status === "not_going"
                      ? wt(lang, "ans_not_going")
                      : tr.my_status === "later"
                        ? wt(lang, "ans_later")
                        : wt(lang, "ans_none");
                return (
                  <article key={tr.id} className="card training">
                    <div className="training-top">
                      <div className="date-chip">
                        <span className="dc-wd">{p.weekday}</span>
                        <span className="dc-day">{p.day}</span>
                        <span className="dc-mo">{p.month}</span>
                      </div>
                      <div className="training-info">
                        <div className="training-time">{p.time}</div>
                        {tr.place && (
                          <div className="training-place">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" />
                              <circle cx="12" cy="9.5" r="2.5" />
                            </svg>
                            <span>{tr.place}</span>
                          </div>
                        )}
                      </div>
                      <div className={cap && confirmed.length >= cap ? "training-count is-full" : "training-count"}>
                        <div>
                          <span className="count-num">{confirmed.length}</span>
                          {cap ? <span className="count-of">/{cap}</span> : null}
                        </div>
                        <div className="count-label">{wt(lang, "going")}</div>
                      </div>
                    </div>

                    {cap ? (
                      <div className="progress">
                        <div className={pct >= 100 ? "progress-bar is-full" : "progress-bar"} style={{ width: `${pct}%` }} />
                      </div>
                    ) : null}

                    <dl className="stats">
                      {cap ? (
                        <div className="stat stat-free">
                          <dt>{wt(lang, "free_spots")}</dt>
                          <dd>{Math.max(0, cap - confirmed.length)}</dd>
                        </div>
                      ) : null}
                      {queue.length > 0 ? (
                        <div className="stat stat-wait">
                          <dt>{wt(lang, "waitlist")}</dt>
                          <dd>{queue.length}</dd>
                        </div>
                      ) : null}
                      <div className="stat stat-no">
                        <dt>{wt(lang, "not_going")}</dt>
                        <dd>{tr.not_going}</dd>
                      </div>
                      {tr.later > 0 ? (
                        <div className="stat stat-later">
                          <dt>{wt(lang, "later_label")}</dt>
                          <dd>{tr.later}</dd>
                        </div>
                      ) : null}
                      <div className="stat">
                        <dt>{wt(lang, "no_answer")}</dt>
                        <dd>{tr.no_answer}</dd>
                      </div>
                    </dl>

                    {confirmed.length > 0 && (
                      <div className="roster">
                        <div className="roster-title">{wt(lang, "going")}</div>
                        <ul className="chips">
                          {confirmed.map((s) => (
                            <li key={s.key} className={s.guestId ? "chip chip-guest" : "chip"}>
                              {seatLabel(s)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {queue.length > 0 && (
                      <div className="roster">
                        <div className="roster-title">{wt(lang, "waitlist")}</div>
                        <ol className="queue">
                          {queue.map((s) => (
                            <li key={s.key}>{seatLabel(s)}</li>
                          ))}
                        </ol>
                      </div>
                    )}

                    <div className={`your your-${tr.my_status ?? "none"}`}>
                      {wt(lang, "your_answer")}: <strong>{myLabel}</strong>
                    </div>
                    <form action={answerAction} className="answer-buttons">
                      <input type="hidden" name="team" value={team.id} />
                      <input type="hidden" name="training" value={tr.id} />
                      <button
                        type="submit"
                        name="status"
                        value="going"
                        className={tr.my_status === "going" ? "btn is-yes" : "btn"}
                      >
                        {wt(lang, "ans_going")}
                      </button>
                      <button
                        type="submit"
                        name="status"
                        value="not_going"
                        className={tr.my_status === "not_going" ? "btn is-no" : "btn"}
                      >
                        {wt(lang, "ans_not_going")}
                      </button>
                      <button
                        type="submit"
                        name="status"
                        value="later"
                        className={tr.my_status === "later" ? "btn is-later" : "btn"}
                      >
                        {wt(lang, "ans_later_btn")}
                      </button>
                    </form>

                    <details className="panel">
                      <summary className="btn btn-quiet">{wt(lang, "btn_guests")}</summary>
                      <form action={addGuestsAction} className="form">
                        <input type="hidden" name="team" value={team.id} />
                        <input type="hidden" name="training" value={tr.id} />
                        <div className="form-row">
                          <label className="field">
                            {wt(lang, "f_guests_count")}
                            <input type="number" name="count" min={1} max={5} defaultValue={1} required />
                          </label>
                          <label className="field">
                            {wt(lang, "f_guest_names")}
                            <input type="text" name="names" maxLength={200} />
                          </label>
                        </div>
                        <div>
                          <button type="submit" className="btn btn-primary">
                            {wt(lang, "f_guests_add")}
                          </button>
                        </div>
                      </form>
                    </details>

                    {myGuests.length > 0 && (
                      <div className="guests">
                        <span className="muted small">{wt(lang, "your_guests")}:</span>
                        {myGuests.map((g) => (
                          <form key={g.key} action={removeGuestAction} className="inline-form">
                            <input type="hidden" name="team" value={team.id} />
                            <input type="hidden" name="training" value={tr.id} />
                            <input type="hidden" name="guest" value={g.guestId ?? ""} />
                            <button type="submit" className="guest-chip">
                              {g.name || wt(lang, "guest_unnamed")} &times;
                            </button>
                          </form>
                        ))}
                      </div>
                    )}

                    {isAdmin && (
                      <form action={cancelTrainingAction} className="card-foot">
                        <input type="hidden" name="team" value={team.id} />
                        <input type="hidden" name="training" value={tr.id} />
                        <button type="submit" className="btn-text btn-danger-text">
                          {wt(lang, "btn_cancel_training")}
                        </button>
                      </form>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="section">
          <div className="section-head">
            <h2 className="section-title">{wt(lang, "schedule")}</h2>
          </div>
          {slots.length === 0 ? (
            <div className="card empty">{wt(lang, "no_schedule")}</div>
          ) : (
            <div className="group">
              {slots.map((s) => (
                <div key={s.id} className="group-row">
                  <span className="slot-day">{weekdayShort(lang, s.weekday)}</span>
                  <span className="row-title">{String(s.start_time).slice(0, 5)}</span>
                  <span className="row-meta">
                    {[s.needed_players ? String(s.needed_players) : null, s.place].filter(Boolean).join(" · ")}
                  </span>
                  {isAdmin && (
                    <form action={deleteSlotAction} className="row-action">
                      <input type="hidden" name="team" value={team.id} />
                      <input type="hidden" name="slot" value={s.id} />
                      <button type="submit" className="btn-text btn-danger-text">
                        {wt(lang, "btn_delete_slot")}
                      </button>
                    </form>
                  )}
                </div>
              ))}
            </div>
          )}
          {slots.length > 0 && (
            <p className="faint small" style={{ marginTop: 10 }}>
              {wt(lang, "schedule_timing", {
                poll: team.poll_hours_before,
                remind: team.remind_hours_before,
              })}
            </p>
          )}

          {isAdmin && (
            <details className="panel">
              <summary className="btn btn-add">{wt(lang, "add_slot")}</summary>
              <form action={addScheduleAction} className="form">
                <input type="hidden" name="team" value={team.id} />
                <div className="field">
                  {wt(lang, "f_days")}
                  <div className="days">
                    {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                      <label key={d} className="day-check">
                        <input type="checkbox" name="day" value={d} />
                        {weekdayShort(lang, d)}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="form-row">
                  <label className="field">
                    {wt(lang, "f_time")}
                    <input type="time" name="time" defaultValue="19:00" required />
                  </label>
                  <label className="field">
                    {wt(lang, "f_need")}
                    <input type="number" name="need" min={0} max={999} defaultValue={12} />
                  </label>
                </div>
                <label className="field">
                  {wt(lang, "f_place")}
                  <input type="text" name="place" maxLength={100} />
                </label>
                <div>
                  <button type="submit" className="btn btn-primary">
                    {wt(lang, "f_add")}
                  </button>
                </div>
              </form>
            </details>
          )}

          {isAdmin && (
            <details className="panel">
              <summary className="btn">{wt(lang, "timing_title")}</summary>
              <form action={updateTimingAction} className="form">
                <input type="hidden" name="team" value={team.id} />
                <div className="form-row">
                  <label className="field">
                    {wt(lang, "f_poll_hours")}
                    <input type="number" name="poll" min={1} max={336} defaultValue={team.poll_hours_before} required />
                  </label>
                  <label className="field">
                    {wt(lang, "f_remind_hours")}
                    <input type="number" name="remind" min={1} max={336} defaultValue={team.remind_hours_before} required />
                  </label>
                </div>
                <p className="faint small">{wt(lang, "timing_hint")}</p>
                <div>
                  <button type="submit" className="btn btn-primary">
                    {wt(lang, "f_save")}
                  </button>
                </div>
              </form>
            </details>
          )}
        </section>

        {isAdmin && (
          <section className="section">
            <div className="section-head">
              <h2 className="section-title">{wt(lang, "members")}</h2>
              <span className="section-count">{members.length}</span>
            </div>
            <div className="group">
              {members.map((m) => {
                const isMe = String(m.id) === String(user.id);
                const targetIsAdmin = m.role === "admin";
                // организаторов меняет и удаляет только создатель команды
                const canManage = !isMe && (!targetIsAdmin || isOwner);
                return (
                  <div key={m.id} className="group-row member-row">
                    <span className="avatar" aria-hidden="true">
                      {String(m.first_name ?? "?").trim().slice(0, 1).toUpperCase()}
                    </span>
                    <div className="member-main">
                      <span className="row-title">{m.first_name}</span>
                      <span className="row-meta">
                        {[
                          m.username ? `@${m.username}` : null,
                          targetIsAdmin ? wt(lang, "role_admin") : wt(lang, "role_player"),
                          m.plays ? null : wt(lang, "not_playing"),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </div>
                    <div className="member-actions">
                      {isMe && (
                        <form action={togglePlaysAction}>
                          <input type="hidden" name="team" value={team.id} />
                          <button type="submit" className="btn-text">
                            {m.plays ? wt(lang, "btn_play_off") : wt(lang, "btn_play_on")}
                          </button>
                        </form>
                      )}
                      {canManage && (
                        <>
                          <form action={setOrganizerAction}>
                            <input type="hidden" name="team" value={team.id} />
                            <input type="hidden" name="target" value={m.id} />
                            <input type="hidden" name="mode" value={targetIsAdmin ? "remove" : "make"} />
                            <button type="submit" className="btn-text">
                              {targetIsAdmin ? wt(lang, "btn_remove_org") : wt(lang, "btn_make_org")}
                            </button>
                          </form>
                          <details className="confirm">
                            <summary className="btn-text btn-danger-text">{wt(lang, "btn_remove_member")}</summary>
                            <form action={removeMemberAction}>
                              <input type="hidden" name="team" value={team.id} />
                              <input type="hidden" name="target" value={m.id} />
                              <button type="submit" className="btn btn-danger-solid">
                                {wt(lang, "btn_confirm_remove")}
                              </button>
                            </form>
                          </details>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <p className="faint small" style={{ marginTop: 28 }}>
          {wt(lang, "bot_hint")}
        </p>
      </main>
    </>
  );
}
