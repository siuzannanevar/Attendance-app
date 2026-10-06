import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Header from "@/components/Header";
import { sql } from "@/lib/db";
import { getCurrentUser, getLang } from "@/lib/session";
import { wt } from "@/lib/web-i18n";
import { weekdayShort } from "@/bot/format";
import { LOCALES, type Lang } from "@/bot/i18n";

export const dynamic = "force-dynamic";

// Части даты для «карточки-календаря»: день недели, число, месяц, время
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

export default async function TeamPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!/^\d+$/.test(id)) notFound();
  const lang = await getLang(user);

  // Доступ только участникам этой команды
  const [team] = await sql`
    select tm.id, tm.name, tm.timezone, tm.poll_hours_before, tm.remind_hours_before, m.role
    from teams tm join memberships m on m.team_id = tm.id
    where tm.id = ${id} and m.user_id = ${user.id}`;
  if (!team) notFound();
  const isAdmin = team.role === "admin";

  const slots = await sql`
    select weekday, start_time, place, needed_players
    from schedules
    where team_id = ${team.id} and active
    order by weekday, start_time`;

  const trainings = await sql`
    select tr.id, tr.starts_at, tr.place, tr.needed_players,
      (select count(*)::int from rsvps r where r.training_id = tr.id and r.status = 'going') as going,
      (select count(*)::int from rsvps r where r.training_id = tr.id and r.status = 'not_going') as not_going,
      (select count(*)::int from memberships m
         where m.team_id = tr.team_id and m.plays
           and not exists (select 1 from rsvps r where r.training_id = tr.id and r.user_id = m.user_id)
      ) as no_answer,
      (select status from rsvps r where r.training_id = tr.id and r.user_id = ${user.id}) as my_status
    from trainings tr
    where tr.team_id = ${team.id} and tr.starts_at > now()
    order by tr.starts_at
    limit 10`;

  // Имена идущих на ближайшие тренировки
  const goingNames: Record<string, string[]> = {};
  if (trainings.length > 0) {
    const ids = trainings.map((x) => x.id);
    const rows = await sql`
      select r.training_id, u.first_name
      from rsvps r join users u on u.id = r.user_id
      where r.training_id in ${sql(ids)} and r.status = 'going'
      order by r.updated_at`;
    for (const r of rows) (goingNames[r.training_id] ||= []).push(r.first_name);
  }

  const members = isAdmin
    ? await sql`
        select u.first_name, u.username, m.role, m.plays
        from memberships m join users u on u.id = m.user_id
        where m.team_id = ${team.id}
        order by (m.role = 'admin') desc, u.first_name`
    : [];

  const answerLabel = (s: string | null) =>
    s === "going" ? wt(lang, "ans_going") : s === "not_going" ? wt(lang, "ans_not_going") : wt(lang, "ans_none");
  const answerClass = (s: string | null) =>
    s === "going" ? "badge badge-green" : s === "not_going" ? "badge badge-red" : "badge";

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

        <section className="section">
          <h2 className="section-title">{wt(lang, "upcoming")}</h2>
          {trainings.length === 0 ? (
            <div className="card empty">{wt(lang, "no_upcoming")}</div>
          ) : (
            <div className="list">
              {trainings.map((tr) => {
                const p = dateParts(tr.starts_at, team.timezone, lang);
                const pct = tr.needed_players
                  ? Math.min(100, Math.round((tr.going / tr.needed_players) * 100))
                  : 0;
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
                      {tr.needed_players ? (
                        <div className="progress">
                          <div className="progress-bar" style={{ width: `${pct}%` }} />
                        </div>
                      ) : null}
                      <div className="chips">
                        <span className="chip chip-green">
                          ✅ {wt(lang, "going")}: {tr.going}
                          {tr.needed_players ? `/${tr.needed_players}` : ""}
                        </span>
                        <span className="chip chip-red">
                          ❌ {wt(lang, "not_going")}: {tr.not_going}
                        </span>
                        <span className="chip">
                          ⏳ {wt(lang, "no_answer")}: {tr.no_answer}
                        </span>
                      </div>
                      {goingNames[tr.id] && (
                        <div className="names">
                          {goingNames[tr.id].map((n, i) => (
                            <span key={i} className="name-tag">
                              {n}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="your">
                        {wt(lang, "your_answer")}:
                        <span className={answerClass(tr.my_status)}>{answerLabel(tr.my_status)}</span>
                      </div>
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
              {slots.map((s, i) => (
                <div key={i} className="row">
                  <span className="pill">{weekdayShort(lang, s.weekday)}</span>
                  <span className="slot-time">{String(s.start_time).slice(0, 5)}</span>
                  {s.needed_players ? <span className="muted">👥 {s.needed_players}</span> : null}
                  {s.place ? <span className="muted">📍 {s.place}</span> : null}
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
        </section>

        {isAdmin && (
          <section className="section">
            <h2 className="section-title">{wt(lang, "members")}</h2>
            <div className="card rows">
              {members.map((m, i) => (
                <div key={i} className="row">
                  <div className="avatar avatar-sm">{String(m.first_name).charAt(0).toUpperCase()}</div>
                  <span className="member-name">{m.first_name}</span>
                  {m.username && <span className="muted small">@{m.username}</span>}
                  <span className={m.role === "admin" ? "badge badge-admin" : "badge"}>
                    {m.role === "admin" ? wt(lang, "role_admin") : wt(lang, "role_player")}
                  </span>
                  {!m.plays && <span className="muted small">{wt(lang, "not_playing")}</span>}
                </div>
              ))}
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
