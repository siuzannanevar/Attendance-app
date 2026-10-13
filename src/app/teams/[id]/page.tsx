import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Header from "@/components/Header";
import { sql } from "@/lib/db";
import { getCurrentUser, getLang } from "@/lib/session";
import { wt, type WebKey } from "@/lib/web-i18n";
import { weekdayShort } from "@/bot/format";
import { LOCALES, type Lang } from "@/bot/i18n";
import { loadSeatsMany, splitSeats, type Seat } from "@/lib/seats";
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
          <h1 className="page-title" style={{ marginBottom: 0 }}>
            {team.name}
          </h1>
          <span className={isAdmin ? "badge badge-admin" : "badge"}>
            {isAdmin ? wt(lang, "role_admin") : wt(lang, "role_player")}
          </span>
        </div>

        {notice && (
          <div className={notice.ok ? "notice notice-ok" : "notice notice-err"} style={{ marginTop: 14 }}>
            {wt(lang, notice.key)}
          </div>
        )}

        <section className="section">
          <h2 className="section-title">{wt(lang, "upcoming")}</h2>

          {isAdmin && (
            <details className="card" style={{ marginBottom: 10 }}>
              <summary>{wt(lang, "new_training")}</summary>
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
                <button type="submit" className="btn btn-primary">
                  {wt(lang, "f_create")}
                </button>
              </form>
            </details>
          )}

          {trainings.length === 0 ? (
            <div className="card empty">{wt(lang, "no_upcoming")}</div>
          ) : (
            <div className="list">
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
                    <div className="training-date">
                      <div className="td-weekday">{p.weekday}</div>
                      <div className="td-day">{p.day}</div>
                      <div className="td-month">{p.month}</div>
                    </div>
                    <div className="training-body">
                      <div className="training-head">
                        <span className="training-time">{p.time}</span>
                        {tr.place && <span className="muted">📍 {tr.place}</span>}
                      </div>
                      {cap ? (
                        <div className="progress">
                          <div className="progress-bar" style={{ width: `${pct}%` }} />
                        </div>
                      ) : null}
                      <div className="chips">
                        <span className="chip chip-green">
                          ✅ {wt(lang, "going")}: {confirmed.length}
                          {cap ? `/${cap}` : ""}
                        </span>
                        {cap ? (
                          <span className="chip">
                            🆓 {wt(lang, "free_spots")}: {Math.max(0, cap - confirmed.length)}
                          </span>
                        ) : null}
                        {queue.length > 0 ? (
                          <span className="chip chip-amber">
                            🪑 {wt(lang, "waitlist")}: {queue.length}
                          </span>
                        ) : null}
                        <span className="chip chip-red">
                          ❌ {wt(lang, "not_going")}: {tr.not_going}
                        </span>
                        {tr.later > 0 ? (
                          <span className="chip">
                            🤔 {wt(lang, "later_label")}: {tr.later}
                          </span>
                        ) : null}
                        <span className="chip">
                          ⏳ {wt(lang, "no_answer")}: {tr.no_answer}
                        </span>
                      </div>
                      {confirmed.length > 0 && (
                        <div className="names">
                          {confirmed.map((s) => (
                            <span key={s.key} className={s.guestId ? "name-tag name-tag-guest" : "name-tag"}>
                              {seatLabel(s)}
                            </span>
                          ))}
                        </div>
                      )}
                      {queue.length > 0 && (
                        <div className="names">
                          {queue.map((s, i) => (
                            <span key={s.key} className="name-tag name-tag-queue">
                              {i + 1}. {seatLabel(s)}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="your">
                        {wt(lang, "your_answer")}: <b>{myLabel}</b>
                      </div>
                      <form action={answerAction} className="answer-buttons">
                        <input type="hidden" name="team" value={team.id} />
                        <input type="hidden" name="training" value={tr.id} />
                        <button
                          type="submit"
                          name="status"
                          value="going"
                          className={tr.my_status === "going" ? "btn btn-yes-active" : "btn"}
                        >
                          ✅ {wt(lang, "ans_going")}
                        </button>
                        <button
                          type="submit"
                          name="status"
                          value="not_going"
                          className={tr.my_status === "not_going" ? "btn btn-no-active" : "btn"}
                        >
                          ❌ {wt(lang, "ans_not_going")}
                        </button>
                        <button
                          type="submit"
                          name="status"
                          value="later"
                          className={tr.my_status === "later" ? "btn btn-later-active" : "btn"}
                        >
                          {wt(lang, "ans_later_btn")}
                        </button>
                      </form>

                      <details className="inline-details">
                        <summary className="btn">{wt(lang, "btn_guests")}</summary>
                        <form action={addGuestsAction} className="form guests-form">
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
                          <button type="submit" className="btn btn-primary">
                            {wt(lang, "f_guests_add")}
                          </button>
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
                              <button type="submit" className="name-tag guest-tag">
                                {g.name || wt(lang, "guest_unnamed")} ✕
                              </button>
                            </form>
                          ))}
                        </div>
                      )}

                      {isAdmin && (
                        <form action={cancelTrainingAction}>
                          <input type="hidden" name="team" value={team.id} />
                          <input type="hidden" name="training" value={tr.id} />
                          <button type="submit" className="btn btn-ghost btn-danger">
                            {wt(lang, "btn_cancel_training")}
                          </button>
                        </form>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="section">
          <h2 className="section-title">{wt(lang, "schedule")}</h2>
          {slots.length === 0 ? (
            <div className="card empty">{wt(lang, "no_schedule")}</div>
          ) : (
            <div className="card rows">
              {slots.map((s) => (
                <div key={s.id} className="row">
                  <span className="pill">{weekdayShort(lang, s.weekday)}</span>
                  <span className="slot-time">{String(s.start_time).slice(0, 5)}</span>
                  {s.needed_players ? <span className="muted">👥 {s.needed_players}</span> : null}
                  {s.place ? <span className="muted">📍 {s.place}</span> : null}
                  {isAdmin && (
                    <form action={deleteSlotAction} className="row-actions">
                      <input type="hidden" name="team" value={team.id} />
                      <input type="hidden" name="slot" value={s.id} />
                      <button type="submit" className="btn btn-ghost btn-danger">
                        🗑 {wt(lang, "btn_delete_slot")}
                      </button>
                    </form>
                  )}
                </div>
              ))}
              <p className="muted small">
                {wt(lang, "schedule_timing", {
                  poll: team.poll_hours_before,
                  remind: team.remind_hours_before,
                })}
              </p>
            </div>
          )}

          {isAdmin && (
            <details className="card" style={{ marginTop: 10 }}>
              <summary>{wt(lang, "add_slot")}</summary>
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
                <button type="submit" className="btn btn-primary">
                  {wt(lang, "f_add")}
                </button>
              </form>
            </details>
          )}

          {isAdmin && (
            <details className="card" style={{ marginTop: 10 }}>
              <summary>{wt(lang, "timing_title")}</summary>
              <form action={updateTimingAction} className="form">
                <input type="hidden" name="team" value={team.id} />
                <div className="form-row">
                  <label className="field">
                    {wt(lang, "f_poll_hours")}
                    <input
                      type="number"
                      name="poll"
                      min={1}
                      max={336}
                      defaultValue={team.poll_hours_before}
                      required
                    />
                  </label>
                  <label className="field">
                    {wt(lang, "f_remind_hours")}
                    <input
                      type="number"
                      name="remind"
                      min={1}
                      max={336}
                      defaultValue={team.remind_hours_before}
                      required
                    />
                  </label>
                </div>
                <p className="muted small">{wt(lang, "timing_hint")}</p>
                <button type="submit" className="btn btn-primary">
                  {wt(lang, "f_save")}
                </button>
              </form>
            </details>
          )}
        </section>

        {isAdmin && (
          <section className="section">
            <h2 className="section-title">{wt(lang, "members")}</h2>
            <div className="card rows">
              {members.map((m) => {
                const isMe = String(m.id) === String(user.id);
                const targetIsAdmin = m.role === "admin";
                // организаторов меняет и удаляет только создатель команды
                const canManage = !isMe && (!targetIsAdmin || isOwner);
                return (
                  <div key={m.id} className="row">
                    <div className="avatar avatar-sm">{String(m.first_name).charAt(0).toUpperCase()}</div>
                    <span className="member-name">{m.first_name}</span>
                    {m.username && <span className="muted small">@{m.username}</span>}
                    <span className={targetIsAdmin ? "badge badge-admin" : "badge"}>
                      {targetIsAdmin ? wt(lang, "role_admin") : wt(lang, "role_player")}
                    </span>
                    {!m.plays && <span className="muted small">{wt(lang, "not_playing")}</span>}

                    <div className="member-actions">
                      {isMe && (
                        <form action={togglePlaysAction}>
                          <input type="hidden" name="team" value={team.id} />
                          <button type="submit" className="btn btn-ghost">
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
                            <button type="submit" className="btn btn-ghost">
                              {targetIsAdmin ? wt(lang, "btn_remove_org") : wt(lang, "btn_make_org")}
                            </button>
                          </form>
                          <details className="confirm">
                            <summary className="btn btn-ghost btn-danger">{wt(lang, "btn_remove_member")}</summary>
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

        <p className="muted small" style={{ marginTop: 24 }}>
          {wt(lang, "bot_hint")}
        </p>
      </main>
    </>
  );
}
