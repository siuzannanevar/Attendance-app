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
          {wt(lang, "app_title")}
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
              <span className="user">{userName}</span>
              <a href="/api/auth/logout" className="link">
                {wt(lang, "logout")}
              </a>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
