import type { Context } from "grammy";
import { sql } from "@/lib/db";

// Находит пользователя по Telegram id или создаёт его
export async function ensureUser(ctx: Context) {
  const from = ctx.from!;
  const [user] = await sql`
    insert into users (telegram_id, first_name, username)
    values (${from.id}, ${from.first_name}, ${from.username ?? null})
    on conflict (telegram_id) do update
      set first_name = excluded.first_name, username = excluded.username
    returning id`;
  return user;
}
