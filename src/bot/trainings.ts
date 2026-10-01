import { InlineKeyboard } from "grammy";
import type { Bot } from "grammy";
import { sql } from "@/lib/db";
import { ensureUser } from "./helpers";
import { t, LOCALES, type Lang } from "./i18n";

function makeKeyboard(trainingId: string | number, lang: Lang) {
  return new InlineKeyboard()
    .text(t(lang, "btn_going"), `rsvp:${trainingId}:going`)
    .text(t(lang, "btn_not_going"), `rsvp:${trainingId}:not_going`);
}

// Собирает текст сообщения с опросом (на языке команды) и кнопки из данных в базе
async function render(trainingId: string | number) {
  const [row] = await sql`
    select tr.starts_at, tr.place, tr.needed_players,
           tm.id as team_id, tm.name as team_name, tm.timezone, tm.language
    from trainings tr join teams tm on tm.id = tr.team_id
    where tr.id = ${trainingId}`;
  const lang = row.language as Lang;

  const going = await sql`
    select u.first_name
    from rsvps r join users u on u.id = r.user_id
    where r.training_id = ${trainingId} and r.status = 'going'
    order by r.updated_at`;
  const [{ not_going }] = await sql`
    select count(*)::int as not_going from rsvps
    where training_id = ${trainingId} and status = 'not_going'`;
  const [{ members }] = await sql`
    select count(*)::int as members from memberships where team_id = ${row.team_id}`;

  const when = new Intl.DateTimeFormat(LOCALES[lang], {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: row.timezone,
  }).format(row.starts_at);

  const count = row.needed_players ? `${going.length}/${row.needed_players}` : `${going.length}`;
  const noAnswer = Math.max(0, members - going.length - not_going);

  const lines: (string | null)[] = [
    t(lang, "poll_title", { team: row.team_name }),
    `🕒 ${when}`,
    row.place ? `📍 ${row.place}` : null,
    "",
    t(lang, "poll_going", { count }),
    ...going.map((g, i) => `${i + 1}. ${g.first_name}`),
    "",
    t(lang, "poll_not_going", { n: not_going }),
    t(lang, "poll_no_answer", { n: noAnswer }),
  ];

  return {
    text: lines.filter((l): l is string => l !== null).join("\n"),
    keyboard: makeKeyboard(trainingId, lang),
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
    const user = await ensureUser(ctx);
    if (ctx.chat.type === "private") return ctx.reply(t(user.lang, "newtraining_private"));

    const [team] = await sql`
      select tm.id, tm.name, tm.timezone, tm.language
      from teams tm join memberships m on m.team_id = tm.id
      where tm.chat_id = ${ctx.chat.id} and m.user_id = ${user.id} and m.role = 'admin'`;
    if (!team) return ctx.reply(t(user.lang, "newtraining_notlinked"));
    const lang = team.language as Lang;

    const m = String(ctx.match)
      .trim()
      .match(/^(\d{1,2})\.(\d{1,2})\s+(\d{1,2}):(\d{2})\s+(\d{1,3})\s*(.*)$/);
    if (!m) return ctx.reply(t(lang, "newtraining_format"));
    const [, dd, mm, hh, mi, need, place] = m;

    let ts: Date | null = null;
    try {
      ts = await toTimestamp(team.timezone, Number(dd), Number(mm), Number(hh), Number(mi));
    } catch {
      return ctx.reply(t(lang, "newtraining_baddate"));
    }
    if (!ts) return ctx.reply(t(lang, "newtraining_nodate"));

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

  // Нажатие кнопок «Иду» / «Не иду»; ответы-подсказки — на языке нажавшего
  bot.callbackQuery(/^rsvp:(\d+):(going|not_going)$/, async (ctx) => {
    const match = ctx.match as RegExpMatchArray;
    const trainingId = match[1];
    const status = match[2];
    const user = await ensureUser(ctx);

    const [tr] = await sql`select team_id, starts_at from trainings where id = ${trainingId}`;
    if (!tr) return ctx.answerCallbackQuery({ text: t(user.lang, "cb_not_found") });
    if (tr.starts_at < new Date()) {
      return ctx.answerCallbackQuery({ text: t(user.lang, "cb_past") });
    }

    const [member] = await sql`
      select 1 as ok from memberships where team_id = ${tr.team_id} and user_id = ${user.id}`;
    if (!member) {
      return ctx.answerCallbackQuery({ text: t(user.lang, "cb_not_member"), show_alert: true });
    }

    const [current] = await sql`
      select status from rsvps where training_id = ${trainingId} and user_id = ${user.id}`;
    if (current && current.status === status) {
      return ctx.answerCallbackQuery({ text: t(user.lang, "cb_already") });
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
      text: t(user.lang, status === "going" ? "cb_saved_going" : "cb_saved_not_going"),
    });
  });
}
