import { redirect } from "next/navigation";
import Header from "@/components/Header";
import WebAppAutoLogin from "@/components/WebAppAutoLogin";
import BrowserLogin from "@/components/BrowserLogin";
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
          <div className="auth-logo" aria-hidden="true">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
          <h1>{wt(lang, "login_title")}</h1>
          <p className="muted">{wt(lang, "login_hint")}</p>
          {error && <p className="notice notice-err">{wt(lang, "login_failed")}</p>}
          <BrowserLogin
            botUsername="attendance_team2026_bot"
            labels={{
              button: wt(lang, "login_bot_button"),
              web: wt(lang, "login_web_button"),
              preparing: wt(lang, "login_preparing"),
              waiting: wt(lang, "login_waiting"),
            }}
          />
          <p className="faint small">{wt(lang, "login_bot_hint")}</p>
        </div>
      </main>
    </>
  );
}
