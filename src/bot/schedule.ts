import { InlineKeyboard } from "grammy";
import type { Api, Bot } from "grammy";
import { sql } from "@/lib/db";
import { ensureUser } from "./helpers";
import { t, type Lang } from "./i18n";
import { formatWhen, parseWeekdays, weekdayShort } from "./format";
import { runTick } from "@/lib/tick";

type Row = Record<string, any>;

// «ср,пт 19:00 12 Место»
const SCHEDULE_RE = /^([\p{L}\d]+(?:\s*,\s*[\p{L}\d]+)*)\s+(\d{1,2}):(\d{2})\s+(\d{1,3})\s*(.*)$/u;
// «48 24»
const TIMING_RE = /^(\d{1,3})\s+(\d{1,3})$/;
const pad = (n: number) => String(n).padStart(2, "0");

async function adminTeams(userId: string): Promise<Row[]> {
  return sql`
    select tm.id, tm.name, tm.language, tm.chat_id, tm.poll_hours_before, tm.remind_hours_before
    from teams tm join memberships m on m.team_id = tm.id
    where m.user_id = ${userId} and m.role = 'admin'
    order by tm.name`;
}

// Выполняет /newschedule или /timing для выбранной команды и возвращает текст ответа
async function runAction(
  api: Api,
  kind: string,
  team: Row,
  userId: string,
  lang: Lang,
  args: string
): Promise<string> {
  if (kind === "timing") {
    const m = args.match(TIMING_RE);
    if (!m) return t(lang, "timing_usage");
    const poll = Number(m[1]);
    const remind = Number(m[2]);
    if (poll < 1 || poll > 336 || remind < 1 || remind > 336 || poll < remind) {
      return t(lang, "timing_bad");
    }
    await sql`
      update teams set poll_hours_before = ${poll}, remind_hours_before = ${remind}
      where id = ${team.id}`;
    return t(lang, "timing_saved", { team: team.name, poll, remind });
  }

  const m = args.match(SCHEDULE_RE);
  if (!m) return t(lang, "schedule_usage");
  const parsed = parseWeekdays(m[1]);
  if ("bad" in parsed) return t(lang, "schedule_bad_day", { day: parsed.bad });
  const hour = Number(m[2]);
  const minute = Number(m[3]);
  if (hour > 23 || minute > 59) return t(lang, "schedule_bad_time");
  const need = Number(m[4]);
  const place = m[5].trim();
  const time = `${pad(hour)}:${pad(minute)}`;

  for (const day of parsed.days) {
    await sql`
      insert into schedules (team_id, weekday, start_time, place, needed_players, created_by)
      values (${team.id}, ${day}, ${time}::time, ${place || null}, ${need || null}, ${userId})
      on conflict (team_id, weekday, start_time)
      do update set place = excluded.place, needed_players = excluded.needed_players, active = true`;
  }

  // Сразу создаём ближайшие тренировки и публикуем опросы, если уже пора
  try {
    await runTick(api, team.id);
  } catch (e) {
    console.error("runTick after newschedule:", e);
  }

  const slots = parsed.days.map((d) => `${weekdayShort(lang, d)} ${time}`).join(", ");
  let text = t(lang, "schedule_added", {
    slots,
    poll: team.poll_hours_before,
    remind: team.remind_hours_before,
  });
  if (!team.chat_id) text += "\n\n" + t(lang, "schedule_no_group");
  return text;
}

// Текст и кнопки расписания одной команды
async function renderSchedule(teamId: string | number, lang: Lang, withButtons: boolean) {
  const [tm] = await sql`
    select name, poll_hours_before, remind_hours_before from teams where id = ${teamId}`;
  const slots = await sql`
    select id, weekday, start_time, place, needed_players
    from schedules
    where team_id = ${teamId} and active
    order by weekday, start_time`;

  const lines: string[] = [`📅 ${tm.name}`];
  if (slots.length === 0) {
    lines.push(t(lang, "schedule_empty"));
  } else {
    for (const s of slots) {
      const time = String(s.start_time).slice(0, 5);
      lines.push(
        `• ${weekdayShort(lang, s.weekday)} ${time}` +
          (s.needed_players ? ` · ${s.needed_players}` : "") +
          (s.place ? ` · ${s.place}` : "")
      );
    }
    lines.push(
      "",
      t(lang, "schedule_timing_line", { poll: tm.poll_hours_before, remind: tm.remind_hours_before })
    );
  }

  let keyboard: InlineKeyboard | undefined;
  if (withButtons && slots.length > 0) {
    keyboard = new InlineKeyboard();
    for (const s of slots) {
      keyboard
        .text(`🗑 ${weekdayShort(lang, s.weekday)} ${String(s.start_time).slice(0, 5)}`, `ds:${s.id}`)
        .row();
    }
  }
  return { text: lines.join("\n"), keyboard };
}

export function registerSchedule(bot: Bot) {
  // ----- общий разбор /newschedule и /timing
  async function handleAction(ctx: any, kind: "schedule" | "timing") {
    const user = await ensureUser(ctx);
    if (ctx.chat.type !== "private") return ctx.reply(t(user.lang, "private_only"));

    const args = String(ctx.match).trim();
    const valid = kind === "schedule" ? SCHEDULE_RE.test(args) : TIMING_RE.test(args);
    if (!valid) return ctx.reply(t(user.lang, kind === "schedule" ? "schedule_usage" : "timing_usage"));

    const teams = await adminTeams(user.id);
    if (teams.length === 0) return ctx.reply(t(user.lang, "newtraining_no_admin_team"));

    if (teams.length > 1) {
      await sql`update users set pending_action = ${kind + "|" + args} where id = ${user.id}`;
      const kb = new InlineKeyboard();
      teams.forEach((x) => kb.text(x.name, `pt:${x.id}`).row());
      return ctx.reply(t(user.lang, "choose_team"), { reply_markup: kb });
    }
    return ctx.reply(await runAction(ctx.api, kind, teams[0], user.id, user.lang, args));
  }

  bot.command("newschedule", (ctx) => handleAction(ctx, "schedule"));
  bot.command("timing", (ctx) => handleAction(ctx, "timing"));

  // Выбор команды кнопкой
  bot.callbackQuery(/^pt:(\d+)$/, async (ctx) => {
    const teamId = (ctx.match as RegExpMatchArray)[1];
    const user = await ensureUser(ctx);
    const [u] = await sql`select pending_action from users where id = ${user.id}`;
    if (!u || !u.pending_action) {
      return ctx.answerCallbackQuery({ text: t(user.lang, "newtraining_expired"), show_alert: true });
    }
    const team = (await adminTeams(user.id)).find((x) => String(x.id) === teamId);
    if (!team) {
      return ctx.answerCallbackQuery({ text: t(user.lang, "not_organizer"), show_alert: true });
    }
    const [kind, ...rest] = String(u.pending_action).split("|");
    const text = await runAction(ctx.api, kind, team, user.id, user.lang, rest.join("|"));
    await sql`update users set pending_action = null where id = ${user.id}`;
    try {
      await ctx.editMessageText(text);
    } catch (e) {
      console.error("editMessageText:", e);
    }
    return ctx.answerCallbackQuery();
  });

  // ----- /schedule: показать расписание (организатору — с кнопками удаления)
  bot.command("schedule", async (ctx) => {
    const user = await ensureUser(ctx);

    if (ctx.chat.type !== "private") {
      const [team] = await sql`select id from teams where chat_id = ${ctx.chat.id}`;
      if (!team) return;
      const { text } = await renderSchedule(team.id, user.lang, false);
      return ctx.reply(text);
    }

    const teams = await sql`
      select tm.id, m.role
      from teams tm join memberships m on m.team_id = tm.id
      where m.user_id = ${user.id}
      order by tm.name`;
    if (teams.length === 0) return ctx.reply(t(user.lang, "no_teams"));

    for (const tm of teams) {
      const { text, keyboard } = await renderSchedule(tm.id, user.lang, tm.role === "admin");
      await ctx.reply(text, keyboard ? { reply_markup: keyboard } : undefined);
    }
  });

  // Удалить день расписания
  bot.callbackQuery(/^ds:(\d+)$/, async (ctx) => {
    const id = (ctx.match as RegExpMatchArray)[1];
    const user = await ensureUser(ctx);
    const [s] = await sql`
      select s.id, s.team_id
      from schedules s join memberships m on m.team_id = s.team_id
      where s.id = ${id} and m.user_id = ${user.id} and m.role = 'admin'`;
    if (!s) {
      return ctx.answerCallbackQuery({ text: t(user.lang, "not_organizer"), show_alert: true });
    }
    await sql.begin(async (tx) => {
      // будущие тренировки, для которых опрос ещё не опубликован, удаляем вместе с днём
      await tx`
        delete from trainings
        where schedule_id = ${id} and poll_message_id is null and starts_at > now()`;
      await tx`delete from schedules where id = ${id}`;
    });
    const { text, keyboard } = await renderSchedule(s.team_id, user.lang, true);
    try {
      await ctx.editMessageText(text, keyboard ? { reply_markup: keyboard } : undefined);
    } catch (e) {
      console.error("editMessageText:", e);
    }
    return ctx.answerCallbackQuery({ text: t(user.lang, "slot_deleted") });
  });

  // ----- Кнопки из предупреждения о недоборе: позвать ещё / текст приглашения
  bot.callbackQuery(/^sf:(call|text):(\d+)$/, async (ctx) => {
    const match = ctx.match as RegExpMatchArray;
    const action = match[1];
    const trainingId = match[2];
    const user = await ensureUser(ctx);

    const [tr] = await sql`
      select tr.id, tr.starts_at, tr.place, tr.needed_players, tr.poll_message_id,
             tm.name as team_name, tm.chat_id, tm.language, tm.timezone
      from trainings tr
      join teams tm on tm.id = tr.team_id
      join memberships m on m.team_id = tm.id
      where tr.id = ${trainingId} and m.user_id = ${user.id} and m.role = 'admin'`;
    if (!tr) {
      return ctx.answerCallbackQuery({ text: t(user.lang, "not_organizer"), show_alert: true });
    }

    const [{ going }] = await sql`
      select count(*)::int as going from rsvps
      where training_id = ${trainingId} and status = 'going'`;
    const missing = Math.max(0, Number(tr.needed_players ?? 0) - going);
    if (missing === 0) return ctx.answerCallbackQuery({ text: t(user.lang, "call_enough") });

    const teamLang = tr.language as Lang;
    const when = formatWhen(tr.starts_at, tr.timezone, teamLang);

    if (action === "call") {
      if (!tr.chat_id) return ctx.answerCallbackQuery({ text: t(user.lang, "schedule_no_group"), show_alert: true });
      await ctx.api.sendMessage(tr.chat_id, t(teamLang, "call_group", { missing, when }), {
        reply_parameters:
          Number(tr.poll_message_id) > 0
            ? { message_id: Number(tr.poll_message_id), allow_sending_without_reply: true }
            : undefined,
      });
      return ctx.answerCallbackQuery({ text: t(user.lang, "call_sent") });
    }

    // Текст, который организатор может переслать в другие чаты
    const contact = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
    const invite = t(teamLang, "invite_text", {
      team: tr.team_name,
      when,
      place: tr.place ? `, 📍 ${tr.place}` : "",
      missing,
      contact,
    });
    await ctx.api.sendMessage(ctx.from.id, t(user.lang, "invite_text_hint"));
    await ctx.api.sendMessage(ctx.from.id, invite);
    return ctx.answerCallbackQuery();
  });
}
