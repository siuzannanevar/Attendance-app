import { wt } from "@/lib/web-i18n";
import type { Lang } from "@/bot/i18n";

const LANGS: [Lang, string][] = [
  ["et", "ET"],
  ["ru", "RU"],
  ["en", "EN"],
];

export default function Header({
  lang,
  next,
  userName,
}: {
  lang: Lang;
  next: string;
  userName?: string;
}) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <a href="/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
          <span className="brand-text">{wt(lang, "app_title")}</span>
        </a>
        <nav className="topbar-right">
          <div className="lang">
            {LANGS.map(([l, label]) => (
              <a
                key={l}
                href={`/api/lang?l=${l}&next=${encodeURIComponent(next)}`}
                className={l === lang ? "lang-item active" : "lang-item"}
              >
                {label}
              </a>
            ))}
          </div>
          {userName && (
            <>
              <span className="user">
                <span className="avatar" aria-hidden="true">
                  {userName.trim().slice(0, 1).toUpperCase()}
                </span>
                <span className="user-name">{userName}</span>
              </span>
              <a href="/api/auth/logout" className="logout">
                {wt(lang, "logout")}
              </a>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
