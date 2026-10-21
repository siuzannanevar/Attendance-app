import { InlineKeyboard } from "grammy";
import type { Api, Bot } from "grammy";
import { sql } from "@/lib/db";
import { ensureUser, tryDelete } from "./helpers";
import { t, LOCALES, type Lang } from "./i18n";
import { loadSeats, splitSeats, type Seat } from "@/lib/seats";

// noGuests: у запасных игроков нет кнопки «Иду с кем-то» (только «Иду», «Не иду», «Отвечу позже»)
function makeKeyboard(trainingId: string | number, lang: Lang, noGuests = false) {
  const kb = new InlineKeyboard()
    .text(t(lang, "btn_going"), `rsvp:${trainingId}:going`)
    .text(t(lang, "btn_not_going"), `rsvp:${trainingId}:not_going`)
    .row();
  if (!noGuests) kb.text(t(lang, "btn_guests"), `rsvp:${trainingId}:guests`);
  return kb.text(t(lang, "btn_later"), `rsvp:${trainingId}:later`);
}

// Запасной игрок: не играет «по умолчанию» и стоит в очереди запасных
export async function isReserve(teamId: string | number, userId: string | number): Promise<boolean> {
  const [r] = await sql`
    select 1 as ok from memberships
    where team_id = ${teamId} and user_id = ${userId} and reserve_order is not null and not plays`;
  return !!r;
}

// Собирает текст сообщения с опросом (на языке команды) и кнопки из данных в базе.
// «Идут» — первые N мест по порядку нажатий (участники и их гости), остальные в очереди.
export async function render(trainingId: string | number, opts: { noGuests?: boolean } = {}) {
  const [row] = await sql`
    select tr.starts_at, tr.place, tr.needed_players,
           tm.id as team_id, tm.name as team_name, tm.timezone, tm.language
    from trainings tr join teams tm on tm.id = tr.team_id
    where tr.id = ${trainingId}`;
  const lang = row.language as Lang;
  const cap = row.needed_players ? Number(row.needed_players) : 0; // 0 = без ограничения

  const seats = await loadSeats(trainingId);
  const { confirmed, queue } = splitSeats(seats, cap);

  const [{ not_going, later }] = await sql`
    select (count(*) filter (where status = 'not_going'))::int as not_going,
           (count(*) filter (where status = 'later'))::int as later
    from rsvps where training_id = ${trainingId}`;
  const [{ no_answer }] = await sql`
    select count(*)::int as no_answer
    from memberships m
    where m.team_id = ${row.team_id} and m.plays
      and not exists (
        select 1 from rsvps r where r.training_id = ${trainingId} and r.user_id = m.user_id
      )`;

  const when = new Intl.DateTimeFormat(LOCALES[lang], {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: row.timezone,
  }).format(row.starts_at);

  const label = (s: Seat) =>
    s.guestId
      ? t(lang, "poll_guest", { name: s.name || t(lang, "guest_unnamed"), host: s.hostName })
      : s.name;
  const count = cap ? `${confirmed.length}/${cap}` : `${confirmed.length}`;

  const lines: (string | null)[] = [
    t(lang, "poll_title", { team: row.team_name }),
    when,
    row.place ? row.place : null,
    "",
    t(lang, "poll_going", { count }),
    ...confirmed.map((s, i) => `${i + 1}. ${label(s)}`),
    queue.length > 0 ? "" : null,
    queue.length > 0 ? t(lang, "poll_waitlist", { n: queue.length }) : null,
    ...queue.map((s, i) => `${i + 1}. ${label(s)}`),
    "",
    cap ? t(lang, "poll_free", { n: Math.max(0, cap - confirmed.length) }) : null,
    t(lang, "poll_not_going", { n: not_going }),
    later > 0 ? t(lang, "poll_later", { n: later }) : null,
    t(lang, "poll_no_answer", { n: no_answer }),
  ];

  return {
    text: lines.filter((l): l is string => l !== null).join("\n"),
    keyboard: makeKeyboard(trainingId, lang, opts.noGuests),
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

// Разбор «15.10 19:00 12 Место»
const ARGS_RE = /^(\d{1,2})\.(\d{1,2})\s+(\d{1,2}):(\d{2})\s+(\d{1,3})\s*(.*)$/;
function parseArgs(text: string) {
  const m = text.trim().match(ARGS_RE);
  if (!m) return null;
  return {
    day: Number(m[1]),
    month: Number(m[2]),
    hour: Number(m[3]),
    minute: Number(m[4]),
    need: Number(m[5]),
    place: m[6].trim(),
  };
}

type PublishResult = "ok" | "format" | "baddate" | "nodate" | "nogroup" | "postfail";
type TeamRow = Record<string, any>;

// Создаёт тренировку и публикует опрос в привязанной группе команды
export async function publishTraining(
  api: Api,
  team: TeamRow,
  userId: string,
  argsText: string
): Promise<PublishResult> {
  const a = parseArgs(argsText);
  if (!a) return "format";
  if (!team.chat_id) return "nogroup";

  let ts: Date | null = null;
  try {
    ts = await toTimestamp(team.timezone, a.day, a.month, a.hour, a.minute);
  } catch {
    return "baddate";
  }
  if (!ts) return "nodate";

  const [tr] = await sql`
    insert into trainings (team_id, starts_at, place, needed_players, created_by)
    values (${team.id}, ${ts}, ${a.place || null}, ${a.need || null}, ${userId})
    returning id`;

  try {
    const { text, keyboard } = await render(tr.id);
    const msg = await api.sendMessage(team.chat_id, text, { reply_markup: keyboard });
    await sql`
      update trainings
      set poll_chat_id = ${team.chat_id}, poll_message_id = ${msg.message_id}
      where id = ${tr.id}`;
  } catch (e) {
    console.error("publishTraining:", e);
    await sql`delete from trainings where id = ${tr.id}`; // чтобы не оставалась тренировка без опроса
    return "postfail";
  }
  return "ok";
}

function errorText(lang: Lang, result: PublishResult, teamName: string): string {
  switch (result) {
    case "format":
      return t(lang, "newtraining_format");
    case "baddate":
      return t(lang, "newtraining_baddate");
    case "nodate":
      return t(lang, "newtraining_nodate");
    case "nogroup":
      return t(lang, "newtraining_group_missing", { team: teamName });
    default:
      return t(lang, "newtraining_post_failed");
  }
}

export function registerTrainings(bot: Bot) {
  bot.command("newtraining", async (ctx) => {
    const user = await ensureUser(ctx);
    const argsText = String(ctx.match).trim();

    // --- В группе (запасной вариант): создаём тренировку и убираем сообщение-команду
    if (ctx.chat.type !== "private") {
      const [team] = await sql`
        select tm.id, tm.name, tm.timezone, tm.language, tm.chat_id
        from teams tm join memberships m on m.team_id = tm.id
        where tm.chat_id = ${ctx.chat.id} and m.user_id = ${user.id} and m.role = 'admin'`;
      if (!team) return ctx.reply(t(user.lang, "newtraining_notlinked"));
      const result = await publishTraining(ctx.api, team, user.id, argsText);
      if (result !== "ok") await ctx.reply(errorText(team.language as Lang, result, team.name));
      return tryDelete(ctx);
    }

    // --- В личном чате (основной вариант): опрос уйдёт в группу команды
    if (!parseArgs(argsText)) return ctx.reply(t(user.lang, "newtraining_format"));

    const teams = await sql`
      select tm.id, tm.name, tm.timezone, tm.language, tm.chat_id
      from teams tm join memberships m on m.team_id = tm.id
      where m.user_id = ${user.id} and m.role = 'admin'
      order by tm.name`;
    if (teams.length === 0) return ctx.reply(t(user.lang, "newtraining_no_admin_team"));

    if (teams.length > 1) {
      // Несколько команд: запоминаем текст и спрашиваем, для какой создать
      await sql`update users set pending_training = ${argsText} where id = ${user.id}`;
      const kb = new InlineKeyboard();
      teams.forEach((x) => kb.text(x.name, `nt:${x.id}`).row());
      return ctx.reply(t(user.lang, "newtraining_choose_team"), { reply_markup: kb });
    }

    const result = await publishTraining(ctx.api, teams[0], user.id, argsText);
    await ctx.reply(
      result === "ok"
        ? t(user.lang, "training_published", { team: teams[0].name })
        : errorText(user.lang, result, teams[0].name)
    );
  });

  // Выбор команды кнопкой (когда организатор состоит в нескольких командах)
  bot.callbackQuery(/^nt:(\d+)$/, async (ctx) => {
    const teamId = (ctx.match as RegExpMatchArray)[1];
    const user = await ensureUser(ctx);

    const [u] = await sql`select pending_training from users where id = ${user.id}`;
    if (!u || !u.pending_training) {
      return ctx.answerCallbackQuery({ text: t(user.lang, "newtraining_expired"), show_alert: true });
    }
    const [team] = await sql`
      select tm.id, tm.name, tm.timezone, tm.language, tm.chat_id
      from teams tm join memberships m on m.team_id = tm.id
      where tm.id = ${teamId} and m.user_id = ${user.id} and m.role = 'admin'`;
    if (!team) {
      return ctx.answerCallbackQuery({ text: t(user.lang, "newtraining_no_admin_team"), show_alert: true });
    }

    const result = await publishTraining(ctx.api, team, user.id, u.pending_training);
    await sql`update users set pending_training = null where id = ${user.id}`;

    const text =
      result === "ok"
        ? t(user.lang, "training_published", { team: team.name })
        : errorText(user.lang, result, team.name);
    try {
      await ctx.editMessageText(text);
    } catch (e) {
      console.error("editMessageText:", e);
    }
    return ctx.answerCallbackQuery();
  });
}
