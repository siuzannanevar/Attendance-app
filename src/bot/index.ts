import { Bot, Context } from "grammy";
import { randomBytes } from "crypto";
import { sql } from "@/lib/db";

export const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);

// Алфавит без похожих символов (нет 0/O, 1/I)
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function makeCode(len = 6) {
  return Array.from(randomBytes(len), (b) => ALPHABET[b % ALPHABET.length]).join("");
}

// Находит пользователя по Telegram id или создаёт его
async function ensureUser(ctx: Context) {
  const from = ctx.from!;
  const [user] = await sql`
    insert into users (telegram_id, first_name, username)
    values (${from.id}, ${from.first_name}, ${from.username ?? null})
    on conflict (telegram_id) do update
      set first_name = excluded.first_name, username = excluded.username
    returning id`;
  return user;
}

bot.command("start", async (ctx) => {
  await ensureUser(ctx);
  await ctx.reply(
    "Привет! Я помогу командам собирать ответы на тренировки.\n\n" +
      "/newteam Название — создать команду\n" +
      "/join КОД — вступить в команду\n" +
      "/myteams — мои команды"
  );
});

bot.command("newteam", async (ctx) => {
  const name = String(ctx.match).trim();
  if (!name) return ctx.reply("Напишите название: /newteam Волейбол колледж");
  const user = await ensureUser(ctx);

  const team = await sql.begin(async (tx) => {
    const [t] = await tx`
      insert into teams (name, created_by) values (${name}, ${user.id})
      returning id, name`;
    await tx`
      insert into memberships (team_id, user_id, role)
      values (${t.id}, ${user.id}, 'admin')`;
    const code = makeCode();
    await tx`
      insert into invite_codes (team_id, code, created_by)
      values (${t.id}, ${code}, ${user.id})`;
    return { name: t.name as string, code };
  });

  await ctx.reply(
    `Команда «${team.name}» создана, вы администратор.\nКод для вступления игроков: ${team.code}`
  );
});

bot.command("join", async (ctx) => {
  const code = String(ctx.match).trim().toUpperCase();
  if (!code) return ctx.reply("Напишите код: /join ABC234");
  const user = await ensureUser(ctx);

  const [invite] = await sql`
    select i.team_id, i.role, t.name
    from invite_codes i join teams t on t.id = i.team_id
    where i.code = ${code} and i.revoked_at is null`;
  if (!invite) return ctx.reply("Код не найден или отозван.");

  await sql`
    insert into memberships (team_id, user_id, role)
    values (${invite.team_id}, ${user.id}, ${invite.role})
    on conflict do nothing`;
  await ctx.reply(`Вы в команде «${invite.name}».`);
});

bot.command("myteams", async (ctx) => {
  const user = await ensureUser(ctx);
  const rows = await sql`
    select t.name, m.role
    from memberships m join teams t on t.id = m.team_id
    where m.user_id = ${user.id}
    order by t.name`;
  if (rows.length === 0) return ctx.reply("Вы пока не состоите ни в одной команде.");
  await ctx.reply(
    rows
      .map((r) => `• ${r.name} (${r.role === "admin" ? "организатор" : "участник"})`)
      .join("\n")
  );
});

bot.catch((err) => console.error("Bot error:", err.error));
