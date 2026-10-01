import { InlineKeyboard } from "grammy";
import type { Bot } from "grammy";
import { sql } from "@/lib/db";
import { ensureUser } from "./helpers";

function makeKeyboard(trainingId: string | number) {
  return new InlineKeyboard()
    .text("✅ Иду", `rsvp:${trainingId}:going`)
    .text("❌ Не иду", `rsvp:${trainingId}:not_going`);
}

// Собирает текст сообщения с опросом и кнопки из данных в базе
async function render(trainingId: string | number) {
  const [t] = await sql`
    select tr.starts_at, tr.place, tr.needed_players,
           tm.id as team_id, tm.name as team_name, tm.timezone
    from trainings tr join teams tm on tm.id = tr.team_id
    where tr.id = ${trainingId}`;

  const going = await sql`
    select u.first_name
    from rsvps r join users u on u.id = r.user_id
    where r.training_id = ${trainingId} and r.status = 'going'
    order by r.updated_at`;
  const [{ not_going }] = await sql`
    select count(*)::int as not_going from rsvps
    where training_id = ${trainingId} and status = 'not_going'`;
  const [{ members }] = await sql`
    select count(*)::int as members from memberships where team_id = ${t.team_id}`;

  const when = new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: t.timezone,
  }).format(t.starts_at);

  const need = t.needed_players ? ` из ${t.needed_players}` : "";
  const noAnswer = Math.max(0, members - going.length - not_going);

  const lines: (string | null)[] = [
    `📅 ${t.team_name}: тренировка`,
    `🕒 ${when}`,
    t.place ? `📍 ${t.place}` : null,
    "",
    `✅ Идут (${going.length}${need}):`,
    ...going.map((g, i) => `${i + 1}. ${g.first_name}`),
    "",
    `❌ Не идут: ${not_going}`,
    `⏳ Не ответили: ${noAnswer}`,
  ];

  return {
    text: lines.filter((l): l is string => l !== null).join("\n"),
    keyboard: makeKeyboard(trainingId),
  };
}

// Переводит «местное время команды» в момент времени; если дата уже прошла — берёт следующий год
async function toTimestamp(tz: string, day: number, month: number, hour: number, minute: number) {
  const thisYear = new Date().getFullYear();
  for (const year of [thisYear, thisYear + 1]) {
    const [r] = await sql`
      select ts, ts < now() as past from (
        select make_timestamp(${year}::int, ${month}::int, ${day}::int, ${hour}::int, ${minute}::int, 0)
               at time zone ${tz}::text as ts
      ) x`;
    if (!r.past) return r.ts as Date;
  }
  return null;
}

export function registerTrainings(bot: Bot) {
  bot.command("newtraining", async (ctx) => {
    if (ctx.chat.type === "private") {
      return ctx.reply("Эту команду нужно писать в группе команды (после /linkgroup).");
    }
    const user = await ensureUser(ctx);

    const [team] = await sql`
      select t.id, t.name, t.timezone
      from teams t join memberships m on m.team_id = t.id
      where t.chat_id = ${ctx.chat.id} and m.user_id = ${user.id} and m.role = 'admin'`;
    if (!team) {
      return ctx.reply("Эта группа не привязана к команде, или вы не организатор этой команды. Привязка: /linkgroup");
    }

    const m = String(ctx.match)
      .trim()
      .match(/^(\d{1,2})\.(\d{1,2})\s+(\d{1,2}):(\d{2})\s+(\d{1,3})\s*(.*)$/);
    if (!m) {
      return ctx.reply(
        "Формат: /newtraining ДД.ММ ЧЧ:ММ МИН_ИГРОКОВ Место\n" +
          "Пример: /newtraining 15.10 19:00 12 Спортзал колледжа"
      );
    }
    const [, dd, mm, hh, mi, need, place] = m;

    let ts: Date | null = null;
    try {
      ts = await toTimestamp(team.timezone, Number(dd), Number(mm), Number(hh), Number(mi));
    } catch {
      return ctx.reply("Похоже, дата или время указаны неверно. Пример: 15.10 19:00");
    }
    if (!ts) return ctx.reply("Не получилось определить дату. Пример: 15.10 19:00");

    const [tr] = await sql`
      insert into trainings (team_id, starts_at, place, needed_players, created_by)
      values (${team.id}, ${ts}, ${place || null}, ${Number(need) || null}, ${user.id})
      returning id`;

    const { text, keyboard } = await render(tr.id);
    const msg = await ctx.reply(text, { reply_markup: keyboard });
    await sql`
      update trainings
      set poll_chat_id = ${ctx.chat.id}, poll_message_id = ${msg.message_id}
      where id = ${tr.id}`;
  });

  // Нажатие кнопок «Иду» / «Не иду»
  bot.callbackQuery(/^rsvp:(\d+):(going|not_going)$/, async (ctx) => {
    const match = ctx.match as RegExpMatchArray;
    const trainingId = match[1];
    const status = match[2];
    const user = await ensureUser(ctx);

    const [t] = await sql`select team_id, starts_at from trainings where id = ${trainingId}`;
    if (!t) return ctx.answerCallbackQuery({ text: "Тренировка не найдена." });
    if (t.starts_at < new Date()) {
      return ctx.answerCallbackQuery({ text: "Эта тренировка уже прошла." });
    }

    const [member] = await sql`
      select 1 as ok from memberships where team_id = ${t.team_id} and user_id = ${user.id}`;
    if (!member) {
      return ctx.answerCallbackQuery({
        text: "Сначала вступите в команду: откройте бота в личных сообщениях и отправьте /join КОД",
        show_alert: true,
      });
    }

    const [current] = await sql`
      select status from rsvps where training_id = ${trainingId} and user_id = ${user.id}`;
    if (current && current.status === status) {
      return ctx.answerCallbackQuery({ text: "Ваш ответ уже записан." });
    }

    await sql.begin(async (tx) => {
      await tx`
        insert into rsvps (training_id, user_id, status)
        values (${trainingId}, ${user.id}, ${status})
        on conflict (training_id, user_id)
        do update set status = excluded.status, updated_at = now()`;
      await tx`
        insert into rsvp_events (training_id, user_id, status)
        values (${trainingId}, ${user.id}, ${status})`;
    });

    const { text, keyboard } = await render(trainingId);
    try {
      await ctx.editMessageText(text, { reply_markup: keyboard });
    } catch (e) {
      console.error("editMessageText:", e);
    }
    await ctx.answerCallbackQuery({
      text: status === "going" ? "Ответ записан: иду ✅" : "Ответ записан: не иду ❌",
    });
  });
}
