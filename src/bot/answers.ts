import { InlineKeyboard } from "grammy";
import type { Api, Bot } from "grammy";
import { sql } from "@/lib/db";
import { ensureUser } from "./helpers";
import { t, type Lang } from "./i18n";
import { render, isReserve } from "./trainings";
import { formatWhen } from "./format";
import { parseGuestNames } from "@/lib/seats";
import { addGuests, applyAnswer, type AnswerStatus } from "@/lib/rsvp";

// Сообщение о результате «Иду с кем-то»
async function finishGuests(
  api: Api,
  user: { id: string; lang: Lang },
  trainingId: string,
  names: (string | null)[]
): Promise<string> {
  const res = await addGuests(api, user.id, trainingId, names);
  if (res.result === "notfound") return t(user.lang, "cb_not_found");
  if (res.result === "cancelled") return t(user.lang, "cb_cancelled");
  if (res.result === "past") return t(user.lang, "cb_past");
  if (res.result === "notmember") return t(user.lang, "cb_not_member");
  if (res.result === "toomany") return t(user.lang, "guests_toomany");
  return t(user.lang, "guests_done", {
    n: names.length,
    in: res.guestsIn ?? 0,
    queued: res.guestsQueued ?? 0,
  });
}

// Кнопки под опросом: «Иду» / «Не иду» / «Отвечу позже» / «Иду с кем-то»
export function registerAnswers(bot: Bot) {
  bot.callbackQuery(/^rsvp:(\d+):(going|not_going|later)$/, async (ctx) => {
    const match = ctx.match as RegExpMatchArray;
    const trainingId = match[1];
    const status = match[2] as AnswerStatus;
    const user = await ensureUser(ctx);

    const res = await applyAnswer(ctx.api, user.id, trainingId, status);
    if (res.result === "notfound") return ctx.answerCallbackQuery({ text: t(user.lang, "cb_not_found") });
    if (res.result === "cancelled") return ctx.answerCallbackQuery({ text: t(user.lang, "cb_cancelled") });
    if (res.result === "past") return ctx.answerCallbackQuery({ text: t(user.lang, "cb_past") });
    if (res.result === "notmember") {
      return ctx.answerCallbackQuery({ text: t(user.lang, "cb_not_member"), show_alert: true });
    }
    if (res.result === "same") return ctx.answerCallbackQuery({ text: t(user.lang, "cb_already") });

    // Опрос в группе уже обновлён. Если нажали в личной копии (напоминание «позже»), обновляем и её.
    if (ctx.chat?.type === "private") {
      try {
        const [trRow] = await sql`select team_id from trainings where id = ${trainingId}`;
        const reserve = trRow ? await isReserve(trRow.team_id, user.id) : false;
        const { text, keyboard } = await render(trainingId, { noGuests: reserve });
        await ctx.editMessageText(text, { reply_markup: keyboard });
      } catch {
        /* текст не изменился */
      }
    }

    let toast: string;
    if (status === "going") {
      toast =
        res.placement === "waitlist"
          ? t(user.lang, "cb_in_queue", { n: res.position ?? 1 })
          : t(user.lang, "cb_saved_going");
    } else if (status === "later") {
      toast = t(user.lang, "cb_saved_later");
    } else {
      toast = t(user.lang, "cb_saved_not_going");
    }
    return ctx.answerCallbackQuery({ text: toast });
  });

  // «Иду с кем-то»: разговор продолжается в личных сообщениях (сколько человек, какие имена)
  bot.callbackQuery(/^rsvp:(\d+):guests$/, async (ctx) => {
    const trainingId = (ctx.match as RegExpMatchArray)[1];
    const user = await ensureUser(ctx);

    const [tr] = await sql`
      select tr.starts_at, tr.cancelled_at, tm.timezone,
             exists (select 1 from memberships m where m.team_id = tr.team_id and m.user_id = ${user.id}) as member
      from trainings tr join teams tm on tm.id = tr.team_id
      where tr.id = ${trainingId}`;
    if (!tr) return ctx.answerCallbackQuery({ text: t(user.lang, "cb_not_found") });
    if (tr.cancelled_at) return ctx.answerCallbackQuery({ text: t(user.lang, "cb_cancelled") });
    if (tr.starts_at < new Date()) return ctx.answerCallbackQuery({ text: t(user.lang, "cb_past") });
    if (!tr.member) {
      return ctx.answerCallbackQuery({ text: t(user.lang, "cb_not_member"), show_alert: true });
    }

    const kb = new InlineKeyboard();
    for (let n = 1; n <= 5; n++) kb.text(String(n), `gn:${trainingId}:${n}`);
    kb.row().text(t(user.lang, "btn_cancel"), "gx");
    try {
      await ctx.api.sendMessage(
        ctx.from.id,
        t(user.lang, "guests_ask", { when: formatWhen(tr.starts_at, tr.timezone, user.lang) }),
        { reply_markup: kb }
      );
    } catch {
      return ctx.answerCallbackQuery({ text: t(user.lang, "cb_guests_nodm"), show_alert: true });
    }
    return ctx.answerCallbackQuery({ text: t(user.lang, "cb_guests_dm") });
  });

  // Выбрано число гостей → спрашиваем имена
  bot.callbackQuery(/^gn:(\d+):([1-5])$/, async (ctx) => {
    const match = ctx.match as RegExpMatchArray;
    const trainingId = match[1];
    const n = match[2];
    const user = await ensureUser(ctx);
    await sql`update users set pending_action = ${`guests|${trainingId}|${n}`} where id = ${user.id}`;
    const kb = new InlineKeyboard().text(t(user.lang, "btn_no_names"), `gs:${trainingId}:${n}`);
    try {
      await ctx.editMessageText(t(user.lang, "guests_names_ask"), { reply_markup: kb });
    } catch (e) {
      console.error("editMessageText:", e);
    }
    return ctx.answerCallbackQuery();
  });

  // «Без имён»
  bot.callbackQuery(/^gs:(\d+):([1-5])$/, async (ctx) => {
    const match = ctx.match as RegExpMatchArray;
    const trainingId = match[1];
    const n = Number(match[2]);
    const user = await ensureUser(ctx);
    await sql`update users set pending_action = null where id = ${user.id}`;
    const text = await finishGuests(ctx.api, user, trainingId, parseGuestNames("", n));
    try {
      await ctx.editMessageText(text);
    } catch (e) {
      console.error("editMessageText:", e);
    }
    return ctx.answerCallbackQuery();
  });

  // Отмена
  bot.callbackQuery("gx", async (ctx) => {
    const user = await ensureUser(ctx);
    await sql`update users set pending_action = null where id = ${user.id}`;
    try {
      await ctx.editMessageText(t(user.lang, "leave_cancelled"));
    } catch (e) {
      console.error("editMessageText:", e);
    }
    return ctx.answerCallbackQuery();
  });

  // Имена гостей текстом в личных сообщениях (после выбора числа). Остальные сообщения и команды не трогаем.
  bot.on("message:text", async (ctx, next) => {
    if (ctx.chat.type !== "private" || ctx.message.text.startsWith("/")) return next();
    const user = await ensureUser(ctx);
    const [u] = await sql`select pending_action from users where id = ${user.id}`;
    const m = u?.pending_action ? String(u.pending_action).match(/^guests\|(\d+)\|([1-5])$/) : null;
    if (!m) return next();

    await sql`update users set pending_action = null where id = ${user.id}`;
    const text = await finishGuests(ctx.api, user, m[1], parseGuestNames(ctx.message.text, Number(m[2])));
    await ctx.reply(text);
  });
}
