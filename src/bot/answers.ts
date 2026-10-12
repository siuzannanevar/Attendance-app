import type { Bot } from "grammy";
import { ensureUser } from "./helpers";
import { t } from "./i18n";
import { render } from "./trainings";
import { applyAnswer, type AnswerStatus } from "@/lib/rsvp";

// Кнопки под опросом: «Иду» / «Не иду» / «Отвечу позже»
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
        const { text, keyboard } = await render(trainingId);
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
}
