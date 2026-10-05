import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Header from "@/components/Header";
import { sql } from "@/lib/db";
import { getCurrentUser, getLang } from "@/lib/session";
import { wt } from "@/lib/web-i18n";
import { formatWhen, weekdayShort } from "@/bot/format";

export const dynamic = "force-dynamic";

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

  return (
    <>
      <Header lang={lang} next={`/teams/${id}`} userName={user.first_name} />
      <main className="mx-auto max-w-2xl space-y-6 p-6">
        <Link href="/dashboard" className="text-sm text-gray-500 underline">
          {wt(lang, "back")}
        </Link>
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold">{team.name}</h1>
          <span className="text-sm text-gray-500">
            {isAdmin ? wt(lang, "role_admin") : wt(lang, "role_player")}
          </span>
        </div>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">{wt(lang, "upcoming")}</h2>
          {trainings.length === 0 ? (
            <p className="text-gray-500">{wt(lang, "no_upcoming")}</p>
          ) : (
            trainings.map((tr) => (
              <div key={tr.id} className="space-y-1 rounded-lg border border-gray-300 p-4">
                <div className="font-medium">
                  {formatWhen(tr.starts_at, team.timezone, lang)}
                  {tr.place ? ` · ${tr.place}` : ""}
                </div>
                <div className="text-sm">
                  {wt(lang, "going")}: {tr.going}
                  {tr.needed_players ? `/${tr.needed_players}` : ""} · {wt(lang, "not_going")}:{" "}
                  {tr.not_going} · {wt(lang, "no_answer")}: {tr.no_answer}
                </div>
                {goingNames[tr.id] && (
                  <div className="text-sm text-gray-500">{goingNames[tr.id].join(", ")}</div>
                )}
                <div className="text-sm">
                  {wt(lang, "your_answer")}: <b>{answerLabel(tr.my_status)}</b>
                </div>
              </div>
            ))
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">{wt(lang, "schedule")}</h2>
          {slots.length === 0 ? (
            <p className="text-gray-500">{wt(lang, "no_schedule")}</p>
          ) : (
            <>
              <ul className="space-y-1">
                {slots.map((s, i) => (
                  <li key={i}>
                    {weekdayShort(lang, s.weekday)} {String(s.start_time).slice(0, 5)}
                    {s.needed_players ? ` · ${s.needed_players}` : ""}
                    {s.place ? ` · ${s.place}` : ""}
                  </li>
                ))}
              </ul>
              <p className="text-sm text-gray-500">
                {wt(lang, "schedule_timing", {
                  poll: team.poll_hours_before,
                  remind: team.remind_hours_before,
                })}
              </p>
            </>
          )}
        </section>

        {isAdmin && (
          <section className="space-y-2">
            <h2 className="text-lg font-semibold">{wt(lang, "members")}</h2>
            <ul className="space-y-1">
              {members.map((m, i) => (
                <li key={i}>
                  {m.first_name}
                  {m.username ? ` (@${m.username})` : ""} —{" "}
                  {m.role === "admin" ? wt(lang, "role_admin") : wt(lang, "role_player")}
                  {m.plays ? "" : ` · ${wt(lang, "not_playing")}`}
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="text-sm text-gray-500">{wt(lang, "bot_hint")}</p>
      </main>
    </>
  );
}
