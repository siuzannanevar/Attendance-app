import { wt } from "@/lib/web-i18n";
import type { Lang } from "@/bot/i18n";

const LANGS: [Lang, string][] = [
  ["et", "EE"],
  ["ru", "RU"],
  ["en", "EN"],
];

// Шапка: название, переключатель языка, имя пользователя и «Выйти»
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
          <span className="brand-icon">📋</span>
          {wt(lang, "app_title")}
        </a>
        <div className="topbar-right">
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
              <a href="/api/auth/logout" className="btn btn-ghost">
                {wt(lang, "logout")}
              </a>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
