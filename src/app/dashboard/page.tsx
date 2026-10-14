import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import { sql } from "@/lib/db";
import { getCurrentUser, getLang } from "@/lib/session";
import { wt } from "@/lib/web-i18n";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const lang = await getLang(user);

  const teams = await sql`
    select tm.id, tm.name, m.role
    from teams tm join memberships m on m.team_id = tm.id
    where m.user_id = ${user.id}
    order by tm.name`;

  return (
    <>
      <Header lang={lang} next="/dashboard" userName={user.first_name} />
      <main className="container">
        <h1 className="page-title">{wt(lang, "my_teams")}</h1>
        {teams.length === 0 ? (
          <div className="card empty">{wt(lang, "no_teams")}</div>
        ) : (
          <div className="group">
            {teams.map((tm) => (
              <Link key={tm.id} href={`/teams/${tm.id}`} className="group-row link-row">
                <span className="row-title">{tm.name}</span>
                <span className="row-meta">
                  {tm.role === "admin" ? wt(lang, "role_admin") : wt(lang, "role_player")}
                </span>
                <span className="chev">›</span>
              </Link>
            ))}
          </div>
        )}
        <p className="faint small" style={{ marginTop: 20 }}>
          {wt(lang, "bot_hint")}
        </p>
      </main>
    </>
  );
}
