import { InlineKeyboard } from "grammy";
import type { Bot } from "grammy";
import { randomBytes } from "crypto";
import { sql } from "@/lib/db";
import { ensureUser } from "./helpers";
import { t, type Lang } from "./i18n";

// Запасные игроки: люди вне группы, которым бот пишет лично при недоборе (см. шаг E в lib/tick.ts).
// Организатор управляет списком командой /reserve: код для вступления, очередь, убрать/поднять.

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const makeCode = () => Array.from(randomBytes(6), (b) => ALPHABET[b % ALPHABET.length]).join("");

async function isAdmin(teamId: string | number, userId: string): Promise<boolean> {
  const [r] = await sql`
    select 1 as ok from memberships
    where team_id = ${teamId} and user_id = ${userId} and role = 'admin'`;
  return !!r;
}

// Код приглашения для запасных (создаётся при первом обращении, дальше один и тот же)
async function reserveCode(teamId: string | number, userId: string): Promise<string> {
  const [existing] = await sql`
    select code from invite_codes
    where team_id = ${teamId} and reserve and revoked_at is null
    order by id limit 1`;
  if (existing) return existing.code as string;
  const code = makeCode();
  await sql`
    insert into invite_codes (team_id, code, role, created_by, reserve)
    values (${teamId}, ${code}, 'player', ${userId}, true)`;
  return code;
}

async function renderReserve(teamId: string | number, viewerId: string, lang: Lang) {
  const [tm] = await sql`select name from teams where id = ${teamId}`;
  const rows = await sql`
    select u.id, u.first_name, u.username
    from memberships m join users u on u.id = m.user_id
    where m.team_id = ${teamId} and m.reserve_order is not null
    order by m.reserve_order`;
  const code = await reserveCode(teamId, viewerId);

  let text = t(lang, "reserve_title", { team: tm.name }) + "\n\n";
  if (rows.length === 0) {
    text += t(lang, "reserve_empty") + "\n\n";
  } else {
    const list = rows
      .map((r, i) => `${i + 1}. ${r.first_name}${r.username ? ` (@${r.username})` : ""}`)
      .join("\n");
    text += t(lang, "reserve_list_intro") + "\n" + list + "\n\n";
  }
  text += t(lang, "reserve_code", { code });

  const keyboard = new InlineKeyboard();
  rows.forEach((r, i) => {
    if (i > 0) keyboard.text(`⬆ ${r.first_name}`, `rvu:${teamId}:${r.id}`);
    keyboard.text(`✖ ${r.first_name}`, `rvx:${teamId}:${r.id}`).row();
  });
  return { text, keyboard };
}

export function registerReserve(bot: Bot) {
  bot.command("reserve", async (ctx) => {
    const user = await ensureUser(ctx);
    if (ctx.chat.type !== "private") return ctx.reply(t(user.lang, "private_only"));

    const teams = await sql`
      select tm.id, tm.name
      from memberships m join teams tm on tm.id = m.team_id
      where m.user_id = ${user.id} and m.role = 'admin'
      order by tm.name`;
    if (teams.length === 0) return ctx.reply(t(user.lang, "newtraining_no_admin_team"));

    if (teams.length === 1) {
      const { text, keyboard } = await renderReserve(teams[0].id, user.id, user.lang);
      return ctx.reply(text, { reply_markup: keyboard });
    }
    const kb = new InlineKeyboard();
    for (const tm of teams) kb.text(tm.name, `rv:${tm.id}`).row();
    return ctx.reply(t(user.lang, "reserve_choose_team"), { reply_markup: kb });
  });

  // Показать список запасных выбранной команды (если у организатора их несколько)
  bot.callbackQuery(/^rv:(\d+)$/, async (ctx) => {
    const teamId = (ctx.match as RegExpMatchArray)[1];
    const user = await ensureUser(ctx);
    if (!(await isAdmin(teamId, user.id))) return ctx.answerCallbackQuery();
    const { text, keyboard } = await renderReserve(teamId, user.id, user.lang);
    try {
      await ctx.editMessageText(text, { reply_markup: keyboard });
    } catch (e) {
      console.error("editMessageText:", e);
    }
    return ctx.answerCallbackQuery();
  });

  // Поднять запасного на одну позицию выше в очереди
  bot.callbackQuery(/^rvu:(\d+):(\d+)$/, async (ctx) => {
    const [, teamId, targetId] = ctx.match as RegExpMatchArray;
    const user = await ensureUser(ctx);
    if (!(await isAdmin(teamId, user.id))) return ctx.answerCallbackQuery();

    await sql.begin(async (tx) => {
      const list = await tx`
        select user_id, reserve_order from memberships
        where team_id = ${teamId} and reserve_order is not null
        order by reserve_order for update`;
      const i = list.findIndex((r) => String(r.user_id) === targetId);
      if (i <= 0) return;
      const a = list[i - 1];
      const b = list[i];
      await tx`update memberships set reserve_order = ${b.reserve_order} where team_id = ${teamId} and user_id = ${a.user_id}`;
      await tx`update memberships set reserve_order = ${a.reserve_order} where team_id = ${teamId} and user_id = ${b.user_id}`;
    });

    const { text, keyboard } = await renderReserve(teamId, user.id, user.lang);
    try {
      await ctx.editMessageText(text, { reply_markup: keyboard });
    } catch (e) {
      console.error("editMessageText:", e);
    }
    return ctx.answerCallbackQuery();
  });

  // Убрать из запасных (в команде человек остаётся; полностью удалить можно через /members)
  bot.callbackQuery(/^rvx:(\d+):(\d+)$/, async (ctx) => {
    const [, teamId, targetId] = ctx.match as RegExpMatchArray;
    const user = await ensureUser(ctx);
    if (!(await isAdmin(teamId, user.id))) return ctx.answerCallbackQuery();

    await sql`update memberships set reserve_order = null where team_id = ${teamId} and user_id = ${targetId}`;

    const { text, keyboard } = await renderReserve(teamId, user.id, user.lang);
    try {
      await ctx.editMessageText(text, { reply_markup: keyboard });
    } catch (e) {
      console.error("editMessageText:", e);
    }
    return ctx.answerCallbackQuery();
  });
}
