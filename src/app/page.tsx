import { redirect } from "next/navigation";
import Header from "@/components/Header";
import WebAppAutoLogin from "@/components/WebAppAutoLogin";
import { getCurrentUser, getLang } from "@/lib/session";
import { wt } from "@/lib/web-i18n";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  const lang = await getLang(null);
  const { error } = await searchParams;

  return (
    <>
      <WebAppAutoLogin />
      <Header lang={lang} next="/" />
      <main className="auth">
        <div className="auth-card">
          <h1>{wt(lang, "login_title")}</h1>
          <p className="muted">{wt(lang, "login_hint")}</p>
          {error && <p className="notice notice-err">{wt(lang, "login_failed")}</p>}
          <a
            href="https://t.me/attendance_team2026_bot?start=login"
            className="btn btn-primary btn-lg"
          >
            {wt(lang, "login_bot_button")}
          </a>
          <p className="faint small">{wt(lang, "login_bot_hint")}</p>
        </div>
      </main>
    </>
  );
}
