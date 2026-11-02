import type { Bot, Context } from "grammy";
import { randomBytes } from "crypto";
import { sql } from "@/lib/db";
import { ensureUser, inviteLink } from "./helpers";
import { t, type Lang } from "./i18n";
import { langKeyboard } from "./language";

// Алфавит без похожих символов (нет 0/O, 1/I)
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function makeCode(len = 6) {
  return Array.from(randomBytes(len), (b) => ALPHABET[b % ALPHABET.length]).join("");
}

type JoinUser = { id: string; lang: Lang };

// Код приглашения команды для игроков (создаётся при первом обращении, дальше один и тот же)
async function playerCode(teamId: string | number, userId: string): Promise<string> {
  const [existing] = await sql`
    select code from invite_codes
    where team_id = ${teamId} and not reserve and role = 'player' and revoked_at is null
    order by id limit 1`;
  if (existing) return existing.code as string;
  const code = makeCode();
  await sql`
    insert into invite_codes (team_id, code, role, created_by)
    values (${teamId}, ${code}, 'player', ${userId})`;
  return code;
}

// Вступление по коду: общий путь для /join КОД, ссылки t.me/бот?start=join_КОД и кода, отправленного после /start.
// Возвращает true, если код найден.
async function joinByCode(ctx: Context, user: JoinUser, rawCode: string): Promise<boolean> {
  const code = rawCode.trim().toUpperCase();
  const [invite] = await sql`
    select i.team_id, i.role, i.reserve, tm.name
    from invite_codes i join teams tm on tm.id = i.team_id
    where i.code = ${code} and i.revoked_at is null`;
  if (!invite) {
    await ctx.reply(t(user.lang, "join_bad"));
    return false;
  }

  // Код для запасных: человек не играет «по умолчанию», а встаёт в конец очереди запасных
  if (invite.reserve) {
    await sql`
      insert into memberships (team_id, user_id, role, plays, reserve_order)
      values (${invite.team_id}, ${user.id}, 'player', false,
              (select coalesce(max(reserve_order), 0) + 1 from memberships where team_id = ${invite.team_id}))
      on conflict (team_id, user_id) do update
        set reserve_order = coalesce(memberships.reserve_order, excluded.reserve_order)`;
    await ctx.reply(t(user.lang, "reserve_joined", { name: invite.name }));
    return true;
  }

  await sql`
    insert into memberships (team_id, user_id, role)
    values (${invite.team_id}, ${user.id}, ${invite.role})
    on conflict do nothing`;
  await ctx.reply(t(user.lang, "joined", { name: invite.name }));
  return true;
}

const CODE_RE = /^[A-Za-z0-9]{4,12}$/;

export function registerTeams(bot: Bot) {
  // /start: обычному участнику сразу предлагаем вступить в команду, полный список команд — только организаторам.
  // Ссылка t.me/бот?start=join_КОД вступает в команду сразу, без копирования кода.
  bot.command("start", async (ctx) => {
    const user = await ensureUser(ctx);
    if (ctx.chat.type !== "private") return ctx.reply(t(user.lang, "help"));

    const arg = String(ctx.match).trim();
    const link = arg.match(/^join_([A-Za-z0-9]+)$/);
    if (link) {
      await sql`update users set pending_action = null where id = ${user.id} and pending_action = 'join'`;
      return void (await joinByCode(ctx, user, link[1]));
    }

    const [org] = await sql`
      select 1 as ok from memberships where user_id = ${user.id} and role = 'admin' limit 1`;
    if (org) {
      // организатор: полный функционал
      return ctx.reply(t(user.lang, "help"), { reply_markup: langKeyboard() });
    }

    // обычный участник: просим код, следующее сообщение с кодом вступит в команду
    await sql`update users set pending_action = 'join' where id = ${user.id}`;
    const teams = await sql`
      select tm.name from memberships m join teams tm on tm.id = m.team_id
      where m.user_id = ${user.id} order by tm.name`;
    const text =
      teams.length === 0
        ? t(user.lang, "start_new")
        : t(user.lang, "start_member", { teams: teams.map((x) => `• ${x.name}`).join("\n") });
    return ctx.reply(text, { reply_markup: langKeyboard() });
  });

  // Код, присланный после /start (без команды /join)
  bot.on("message:text", async (ctx, next) => {
    if (ctx.chat.type !== "private" || ctx.message.text.startsWith("/")) return next();
    const user = await ensureUser(ctx);
    const [u] = await sql`select pending_action from users where id = ${user.id}`;
    if (u?.pending_action !== "join") return next();

    const text = ctx.message.text.trim();
    if (!CODE_RE.test(text)) return ctx.reply(t(user.lang, "join_bad"));
    if (await joinByCode(ctx, user, text)) {
      await sql`update users set pending_action = null where id = ${user.id} and pending_action = 'join'`;
    }
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

    await ctx.reply(
      t(user.lang, "team_created", {
        name: team.name,
        code: team.code,
        link: inviteLink(ctx.me.username, team.code),
      }),
      { link_preview_options: { is_disabled: true } }
    );
  });

  bot.command("join", async (ctx) => {
    const user = await ensureUser(ctx);
    if (ctx.chat.type !== "private") return ctx.reply(t(user.lang, "join_private"));
    const code = String(ctx.match).trim();
    if (!code) return ctx.reply(t(user.lang, "join_usage"));
    await joinByCode(ctx, user, code);
  });

  // Ссылки-приглашения для организатора: их можно кинуть в группу, и игроки попадут в бота сразу с кодом
  bot.command("invite", async (ctx) => {
    const user = await ensureUser(ctx);
    if (ctx.chat.type !== "private") return ctx.reply(t(user.lang, "private_only"));
    const teams = await sql`
      select tm.id, tm.name from memberships m join teams tm on tm.id = m.team_id
      where m.user_id = ${user.id} and m.role = 'admin' order by tm.name`;
    if (teams.length === 0) return ctx.reply(t(user.lang, "newtraining_no_admin_team"));

    const lines: string[] = [];
    for (const tm of teams) {
      const code = await playerCode(tm.id, user.id);
      lines.push(t(user.lang, "invite_item", { team: tm.name, link: inviteLink(ctx.me.username, code), code }));
    }
    await ctx.reply(t(user.lang, "invite_title") + "\n\n" + lines.join("\n\n"), {
      link_preview_options: { is_disabled: true },
    });
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
