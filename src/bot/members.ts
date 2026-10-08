  import { InlineKeyboard } from "grammy";
import type { Api, Bot } from "grammy";
import { sql } from "@/lib/db";
import { ensureUser } from "./helpers";
import { t, isLang, type Lang } from "./i18n";
import { render } from "./trainings";

async function isAdmin(teamId: string | number, userId: string): Promise<boolean> {
  const [r] = await sql`
    select 1 as ok from memberships
    where team_id = ${teamId} and user_id = ${userId} and role = 'admin'`;
  return !!r;
}

// Обновляет уже опубликованные опросы будущих тренировок (счётчики после изменений в составе)
async function refreshPolls(api: Api, teamId: string | number) {
  const rows = await sql`
    select id, poll_chat_id, poll_message_id
    from trainings
    where team_id = ${teamId} and starts_at > now() and cancelled_at is null
      and poll_message_id > 0 and poll_chat_id is not null`;
  for (const r of rows) {
    try {
      const { text, keyboard } = await render(r.id);
      await api.editMessageText(r.poll_chat_id, Number(r.poll_message_id), text, {
        reply_markup: keyboard,
      });
    } catch {
      /* текст не изменился или сообщение удалено — не страшно */
    }
  }
}

// Удаляет человека из команды и его ответы на будущие тренировки этой команды
async function removeMember(teamId: string | number, userId: string | number) {
  await sql.begin(async (tx) => {
    await tx`
      delete from rsvps r using trainings tr
      where r.training_id = tr.id and tr.team_id = ${teamId}
        and r.user_id = ${userId} and tr.starts_at > now()`;
    await tx`delete from memberships where team_id = ${teamId} and user_id = ${userId}`;
  });
}

// Список участников команды с кнопками (для организатора)
async function renderMembers(teamId: string | number, viewerId: string, lang: Lang) {
  const [tm] = await sql`select name, created_by from teams where id = ${teamId}`;
  const viewerIsOwner = String(tm.created_by) === String(viewerId);
  const rows = await sql`
    select u.id, u.first_name, u.username, m.role, m.plays
    from memberships m join users u on u.id = m.user_id
    where m.team_id = ${teamId}
    order by (m.role = 'admin') desc, u.first_name`;

  const lines = [`👥 ${tm.name} (${rows.length})`];
  rows.forEach((r, i) => {
    const role = r.role === "admin" ? t(lang, "role_admin") : t(lang, "role_player");
    lines.push(
      `${i + 1}. ${r.first_name}${r.username ? ` (@${r.username})` : ""} — ${role}` +
        (r.plays ? "" : t(lang, "members_not_playing"))
    );
  });
  lines.push("", t(lang, "members_hint"));

  const kb = new InlineKeyboard();
  const me = rows.find((r) => String(r.id) === String(viewerId));
  if (me) kb.text(me.plays ? t(lang, "btn_play_off") : t(lang, "btn_play_on"), `mp:${teamId}`).row();

  for (const r of rows) {
    if (String(r.id) === String(viewerId)) continue;
    const targetIsAdmin = r.role === "admin";
    // роль и удаление других организаторов доступны только создателю команды
    if (targetIsAdmin && !viewerIsOwner) continue;
    kb.text(targetIsAdmin ? `⬇️ ${r.first_name}` : `👑 ${r.first_name}`, `ma:${teamId}:${r.id}`)
      .text(`🗑 ${r.first_name}`, `mr:${teamId}:${r.id}`)
      .row();
  }
  return { text: lines.join("\n"), keyboard: kb };
}

export function registerMembers(bot: Bot) {
  // ----- /members: участники команды (только организатор, в личке)
  bot.command("members", async (ctx) => {
    const user = await ensureUser(ctx);
    if (ctx.chat.type !== "private") return ctx.reply(t(user.lang, "private_only"));

    const teams = await sql`
      select tm.id
      from teams tm join memberships m on m.team_id = tm.id
      where m.user_id = ${user.id} and m.role = 'admin'
      order by tm.name`;
    if (teams.length === 0) return ctx.reply(t(user.lang, "newtraining_no_admin_team"));

    for (const tm of teams) {
      const { text, keyboard } = await renderMembers(tm.id, user.id, user.lang);
      await ctx.reply(text, { reply_markup: keyboard });
    }
  });

  // «Я играю / не играю» (организатор переключает себя)
  bot.callbackQuery(/^mp:(\d+)$/, async (ctx) => {
    const teamId = (ctx.match as RegExpMatchArray)[1];
    const user = await ensureUser(ctx);
    if (!(await isAdmin(teamId, user.id))) {
      return ctx.answerCallbackQuery({ text: t(user.lang, "not_organizer"), show_alert: true });
    }
    const [m] = await sql`
      update memberships set plays = not plays
      where team_id = ${teamId} and user_id = ${user.id}
      returning plays`;
    const { text, keyboard } = await renderMembers(teamId, user.id, user.lang);
    try {
      await ctx.editMessageText(text, { reply_markup: keyboard });
    } catch (e) {
      console.error("editMessageText:", e);
    }
    await refreshPolls(ctx.api, teamId);
    return ctx.answerCallbackQuery({ text: t(user.lang, m.plays ? "play_saved_on" : "play_saved_off") });
  });

  // Удалить участника
  bot.callbackQuery(/^mr:(\d+):(\d+)$/, async (ctx) => {
    const match = ctx.match as RegExpMatchArray;
    const teamId = match[1];
    const targetId = match[2];
    const user = await ensureUser(ctx);

    if (!(await isAdmin(teamId, user.id))) {
      return ctx.answerCallbackQuery({ text: t(user.lang, "not_organizer"), show_alert: true });
    }
    if (String(targetId) === String(user.id)) {
      return ctx.answerCallbackQuery({ text: t(user.lang, "cannot_remove_self"), show_alert: true });
    }

    const [target] = await sql`
      select u.first_name, u.telegram_id, u.language, m.role as target_role,
             tm.name as team_name, tm.language as team_language, tm.created_by
      from memberships m
      join users u on u.id = m.user_id
      join teams tm on tm.id = m.team_id
      where m.team_id = ${teamId} and m.user_id = ${targetId}`;
    if (!target) return ctx.answerCallbackQuery();
    if (target.target_role === "admin" && String(target.created_by) !== String(user.id)) {
      return ctx.answerCallbackQuery({ text: t(user.lang, "owner_only"), show_alert: true });
    }

    await removeMember(teamId, targetId);

    // Сообщаем удалённому человеку (если он начинал диалог с ботом)
    const targetLang: Lang = isLang(target.language) ? target.language : (target.team_language as Lang);
    try {
      await ctx.api.sendMessage(target.telegram_id, t(targetLang, "you_were_removed", { team: target.team_name }));
    } catch {
      /* человек не начинал диалог с ботом — не страшно */
    }

    const { text, keyboard } = await renderMembers(teamId, user.id, user.lang);
    try {
      await ctx.editMessageText(text, { reply_markup: keyboard });
    } catch (e) {
      console.error("editMessageText:", e);
    }
    await refreshPolls(ctx.api, teamId);
    return ctx.answerCallbackQuery({ text: t(user.lang, "member_removed", { name: target.first_name }) });
  });

  // Назначить организатором / снять роль организатора
  bot.callbackQuery(/^ma:(\d+):(\d+)$/, async (ctx) => {
    const match = ctx.match as RegExpMatchArray;
    const teamId = match[1];
    const targetId = match[2];
    const user = await ensureUser(ctx);

    if (!(await isAdmin(teamId, user.id))) {
      return ctx.answerCallbackQuery({ text: t(user.lang, "not_organizer"), show_alert: true });
    }
    if (String(targetId) === String(user.id)) return ctx.answerCallbackQuery();

    const [target] = await sql`
      select u.first_name, u.telegram_id, u.language, m.role,
             tm.name as team_name, tm.language as team_language, tm.created_by
      from memberships m
      join users u on u.id = m.user_id
      join teams tm on tm.id = m.team_id
      where m.team_id = ${teamId} and m.user_id = ${targetId}`;
    if (!target) return ctx.answerCallbackQuery();

    const makeAdmin = target.role !== "admin";
    // снять роль организатора может только создатель команды
    if (!makeAdmin && String(target.created_by) !== String(user.id)) {
      return ctx.answerCallbackQuery({ text: t(user.lang, "owner_only"), show_alert: true });
    }

    await sql`
      update memberships set role = ${makeAdmin ? "admin" : "player"}
      where team_id = ${teamId} and user_id = ${targetId}`;

    // Сообщаем человеку о новой роли (если он начинал диалог с ботом)
    const targetLang: Lang = isLang(target.language) ? target.language : (target.team_language as Lang);
    try {
      await ctx.api.sendMessage(
        target.telegram_id,
        t(targetLang, makeAdmin ? "you_are_organizer" : "you_not_organizer", { team: target.team_name })
      );
    } catch {
      /* человек не начинал диалог с ботом — не страшно */
    }

    const { text, keyboard } = await renderMembers(teamId, user.id, user.lang);
    try {
      await ctx.editMessageText(text, { reply_markup: keyboard });
    } catch (e) {
      console.error("editMessageText:", e);
    }
    return ctx.answerCallbackQuery({
      text: t(user.lang, makeAdmin ? "promoted" : "demoted", { name: target.first_name }),
    });
  });

  // ----- /leave: выйти из команды
  bot.command("leave", async (ctx) => {
    const user = await ensureUser(ctx);
    if (ctx.chat.type !== "private") return ctx.reply(t(user.lang, "private_only"));

    const teams = await sql`
      select tm.id, tm.name
      from teams tm join memberships m on m.team_id = tm.id
      where m.user_id = ${user.id}
      order by tm.name`;
    if (teams.length === 0) return ctx.reply(t(user.lang, "no_teams"));

    const kb = new InlineKeyboard();
    teams.forEach((x) => kb.text(`🚪 ${x.name}`, `lv:${x.id}`).row());
    return ctx.reply(t(user.lang, "leave_choose"), { reply_markup: kb });
  });

  // Подтверждение
  bot.callbackQuery(/^lv:(\d+)$/, async (ctx) => {
    const teamId = (ctx.match as RegExpMatchArray)[1];
    const user = await ensureUser(ctx);
    const [tm] = await sql`
      select tm.name
      from teams tm join memberships m on m.team_id = tm.id
      where tm.id = ${teamId} and m.user_id = ${user.id}`;
    if (!tm) return ctx.answerCallbackQuery();

    const kb = new InlineKeyboard()
      .text(t(user.lang, "btn_yes_leave"), `lc:${teamId}`)
      .text(t(user.lang, "btn_cancel"), "lx");
    try {
      await ctx.editMessageText(t(user.lang, "leave_confirm", { team: tm.name }), { reply_markup: kb });
    } catch (e) {
      console.error("editMessageText:", e);
    }
    return ctx.answerCallbackQuery();
  });

  bot.callbackQuery("lx", async (ctx) => {
    const user = await ensureUser(ctx);
    try {
      await ctx.editMessageText(t(user.lang, "leave_cancelled"));
    } catch (e) {
      console.error("editMessageText:", e);
    }
    return ctx.answerCallbackQuery();
  });

  // Выход
  bot.callbackQuery(/^lc:(\d+)$/, async (ctx) => {
    const teamId = (ctx.match as RegExpMatchArray)[1];
    const user = await ensureUser(ctx);
    const [m] = await sql`
      select m.role, tm.name
      from memberships m join teams tm on tm.id = m.team_id
      where m.team_id = ${teamId} and m.user_id = ${user.id}`;
    if (!m) return ctx.answerCallbackQuery();

    if (m.role === "admin") {
      const [{ admins }] = await sql`
        select count(*)::int as admins from memberships
        where team_id = ${teamId} and role = 'admin'`;
      if (admins <= 1) {
        return ctx.answerCallbackQuery({ text: t(user.lang, "leave_last_admin"), show_alert: true });
      }
    }

    await removeMember(teamId, user.id);
    try {
      await ctx.editMessageText(t(user.lang, "leave_done", { team: m.name }));
    } catch (e) {
      console.error("editMessageText:", e);
    }
    await refreshPolls(ctx.api, teamId);
    return ctx.answerCallbackQuery();
  });
}
