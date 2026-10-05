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
    <header className="flex items-center justify-between border-b border-gray-300 px-4 py-3">
      <a href="/" className="font-semibold">
        {wt(lang, "app_title")}
      </a>
      <div className="flex items-center gap-3 text-sm">
        {LANGS.map(([l, label]) => (
          <a
            key={l}
            href={`/api/lang?l=${l}&next=${encodeURIComponent(next)}`}
            className={l === lang ? "font-bold underline" : "text-gray-500"}
          >
            {label}
          </a>
        ))}
        {userName && (
          <>
            <span>{userName}</span>
            <a href="/api/auth/logout" className="text-gray-500 underline">
              {wt(lang, "logout")}
            </a>
          </>
        )}
      </div>
    </header>
  );
}
