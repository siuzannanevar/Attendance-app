import type { Context } from "grammy";
import { sql } from "@/lib/db";
import { isLang, pickLang, type Lang } from "./i18n";

// Находит пользователя по Telegram id или создаёт его.
// Возвращает id и язык: выбранный через /language или, если не выбран, язык Telegram.
export async function ensureUser(ctx: Context) {
  const from = ctx.from!;
  const [user] = await sql`
    insert into users (telegram_id, first_name, username)
    values (${from.id}, ${from.first_name}, ${from.username ?? null})
    on conflict (telegram_id) do update
      set first_name = excluded.first_name, username = excluded.username
    returning id, language`;
  const lang: Lang = isLang(user.language) ? user.language : pickLang(from.language_code);
  return { id: user.id as string, lang };
}
