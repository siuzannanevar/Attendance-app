import { InlineKeyboard } from "grammy";
import type { Bot } from "grammy";
import { sql } from "@/lib/db";
import { ensureUser } from "./helpers";
import { t, LANG_NAMES, type Lang } from "./i18n";

export function langKeyboard() {
  return new InlineKeyboard()
    .text("🇪🇪 Eesti", "lang:et")
    .text("🇷🇺 Русский", "lang:ru")
    .text("🇬🇧 English", "lang:en");
}

export function registerLanguage(bot: Bot) {
  // В личном чате меняет язык пользователя, в группе — язык сообщений группы (только организатор)
  bot.command("language", async (ctx) => {
    const user = await ensureUser(ctx);
    if (ctx.chat.type === "private") {
      return ctx.reply(t(user.lang, "lang_choose_user"), { reply_markup: langKeyboard() });
    }
    const [team] = await sql`select id, language from teams where chat_id = ${ctx.chat.id}`;
    if (!team) return ctx.reply(t(user.lang, "lang_group_not_linked"));
    const [admin] = await sql`
      select 1 as ok from memberships
      where team_id = ${team.id} and user_id = ${user.id} and role = 'admin'`;
    if (!admin) return ctx.reply(t(user.lang, "lang_group_not_admin"));
    return ctx.reply(t(team.language as Lang, "lang_choose_group"), { reply_markup: langKeyboard() });
  });

  bot.callbackQuery(/^lang:(et|ru|en)$/, async (ctx) => {
    const code = (ctx.match as RegExpMatchArray)[1] as Lang;
    const user = await ensureUser(ctx);
    const chat = ctx.chat;

    if (!chat || chat.type === "private") {
      await sql`update users set language = ${code} where id = ${user.id}`;
      await ctx.editMessageText(t(code, "lang_saved_user", { language: LANG_NAMES[code] }));
      return ctx.answerCallbackQuery();
    }

    const [team] = await sql`select id from teams where chat_id = ${chat.id}`;
    if (!team) {
      return ctx.answerCallbackQuery({ text: t(user.lang, "lang_group_not_linked"), show_alert: true });
    }
    const [admin] = await sql`
      select 1 as ok from memberships
      where team_id = ${team.id} and user_id = ${user.id} and role = 'admin'`;
    if (!admin) {
      return ctx.answerCallbackQuery({ text: t(user.lang, "lang_group_not_admin"), show_alert: true });
    }
    await sql`update teams set language = ${code} where id = ${team.id}`;
    await ctx.editMessageText(t(code, "lang_saved_group", { language: LANG_NAMES[code] }));
    return ctx.answerCallbackQuery();
  });
}
