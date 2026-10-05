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
      <main className="mx-auto max-w-2xl space-y-4 p-6">
        <h1 className="text-2xl font-bold">{wt(lang, "my_teams")}</h1>
        {teams.length === 0 ? (
          <p className="text-gray-500">{wt(lang, "no_teams")}</p>
        ) : (
          <ul className="space-y-2">
            {teams.map((tm) => (
              <li key={tm.id}>
                <Link
                  href={`/teams/${tm.id}`}
                  className="flex items-center justify-between rounded-lg border border-gray-300 p-4 hover:bg-gray-100 hover:text-black"
                >
                  <span className="font-medium">{tm.name}</span>
                  <span className="text-sm text-gray-500">
                    {tm.role === "admin" ? wt(lang, "role_admin") : wt(lang, "role_player")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-gray-500">{wt(lang, "bot_hint")}</p>
      </main>
    </>
  );
}
