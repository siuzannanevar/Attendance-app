import type { Bot } from "grammy";
import { randomBytes } from "crypto";
import { sql } from "@/lib/db";
import { ensureUser } from "./helpers";
import { t, type Lang } from "./i18n";
import { langKeyboard } from "./language";

// Алфавит без похожих символов (нет 0/O, 1/I)
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function makeCode(len = 6) {
  return Array.from(randomBytes(len), (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function registerTeams(bot: Bot) {
  bot.command("start", async (ctx) => {
    const user = await ensureUser(ctx);
    // Под приветствием — кнопки выбора языка
    await ctx.reply(t(user.lang, "help"), { reply_markup: langKeyboard() });
  });

  bot.command("help", async (ctx) => {
    const user = await ensureUser(ctx);
    await ctx.reply(t(user.lang, "help"));
  });

  bot.command("newteam", async (ctx) => {
    const user = await ensureUser(ctx);
    if (ctx.chat.type !== "private") return ctx.reply(t(user.lang, "newteam_private"));
    const name = String(ctx.match).trim();
    if (!name) return ctx.reply(t(user.lang, "newteam_usage"));

    const team = await sql.begin(async (tx) => {
      const [row] = await tx`
        insert into teams (name, created_by, language)
        values (${name}, ${user.id}, ${user.lang})
        returning id, name`;
      await tx`
        insert into memberships (team_id, user_id, role)
        values (${row.id}, ${user.id}, 'admin')`;
      const code = makeCode();
      await tx`
        insert into invite_codes (team_id, code, created_by)
        values (${row.id}, ${code}, ${user.id})`;
      return { name: row.name as string, code };
    });

    await ctx.reply(t(user.lang, "team_created", { name: team.name, code: team.code }));
  });

  bot.command("join", async (ctx) => {
    const user = await ensureUser(ctx);
    if (ctx.chat.type !== "private") return ctx.reply(t(user.lang, "join_private"));
    const code = String(ctx.match).trim().toUpperCase();
    if (!code) return ctx.reply(t(user.lang, "join_usage"));

    const [invite] = await sql`
      select i.team_id, i.role, tm.name
      from invite_codes i join teams tm on tm.id = i.team_id
      where i.code = ${code} and i.revoked_at is null`;
    if (!invite) return ctx.reply(t(user.lang, "join_bad"));

    await sql`
      insert into memberships (team_id, user_id, role)
      values (${invite.team_id}, ${user.id}, ${invite.role})
      on conflict do nothing`;
    await ctx.reply(t(user.lang, "joined", { name: invite.name }));
  });

  bot.command("myteams", async (ctx) => {
    const user = await ensureUser(ctx);
    const rows = await sql`
      select tm.name, m.role
      from memberships m join teams tm on tm.id = m.team_id
      where m.user_id = ${user.id}
      order by tm.name`;
    if (rows.length === 0) return ctx.reply(t(user.lang, "no_teams"));
    await ctx.reply(
      rows
        .map(
          (r) =>
            `• ${r.name} (${r.role === "admin" ? t(user.lang, "role_admin") : t(user.lang, "role_player")})`
        )
        .join("\n")
    );
  });

  // Привязка Telegram-группы к команде (пишет организатор в группе)
  bot.command("linkgroup", async (ctx) => {
    const user = await ensureUser(ctx);
    if (ctx.chat.type === "private") return ctx.reply(t(user.lang, "linkgroup_private"));
    const name = String(ctx.match).trim();

    const teams = await sql`
      select tm.id, tm.name, tm.language
      from teams tm join memberships m on m.team_id = tm.id
      where m.user_id = ${user.id} and m.role = 'admin'
        and (${name}::text = '' or lower(tm.name) = lower(${name}::text))`;

    if (teams.length === 0) return ctx.reply(t(user.lang, "linkgroup_no_team"));
    if (teams.length > 1) {
      return ctx.reply(
        t(user.lang, "linkgroup_many", { list: teams.map((x) => `• ${x.name}`).join("\n") })
      );
    }

    try {
      await sql`update teams set chat_id = ${ctx.chat.id} where id = ${teams[0].id}`;
    } catch (e) {
      console.error(e);
      return ctx.reply(t(user.lang, "linkgroup_fail"));
    }
    await ctx.reply(t(teams[0].language as Lang, "linkgroup_ok", { name: teams[0].name }));
  });
}
