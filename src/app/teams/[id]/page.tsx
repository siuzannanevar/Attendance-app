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
          <h1 className="page-title">{team.name}</h1>
          <span className={isAdmin ? "role is-admin" : "role"}>{isAdmin ? wt(lang, "role_admin") : wt(lang, "role_player")}</span>
        </div>

        {notice && (
          <div className={notice.ok ? "notice" : "notice notice-err"}>{wt(lang, notice.key)}</div>
        )}

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
