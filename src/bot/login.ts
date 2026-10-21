import { randomBytes } from "crypto";
import { InlineKeyboard } from "grammy";
import type { Bot, Context } from "grammy";
import { sql } from "@/lib/db";
import { ensureUser } from "./helpers";
import { t } from "./i18n";
import { isWlCode, wlKey } from "@/lib/weblogin";

const siteUrl = () => process.env.SITE_URL ?? "https://attendance-app-ten-topaz.vercel.app";

// Выдаёт одноразовую ссылку для входа на сайт. Ссылка уходит только в личный чат этого человека.
async function sendLoginLink(ctx: Context) {
  const user = await ensureUser(ctx);
  if (ctx.chat?.type !== "private") return ctx.reply(t(user.lang, "private_only"));

  const secret = randomBytes(24).toString("hex");
  await sql`insert into login_links (secret, user_id) values (${secret}, ${user.id})`;
  const link = `${siteUrl()}/api/auth/confirm?s=${secret}`;

  // Две кнопки: открыть внутри Telegram (вход автоматический) и в браузере (одноразовая ссылка)
  return ctx.reply(t(user.lang, "login_link_text"), {
    reply_markup: new InlineKeyboard()
      .webApp(t(user.lang, "btn_open_app"), siteUrl())
      .row()
      .url(t(user.lang, "btn_open_site"), link),
  });
}

// Просит подтвердить вход, начатый на сайте в браузере (код приходит из ссылки на бота)
async function askBrowserLogin(ctx: Context, code: string) {
  const user = await ensureUser(ctx);
  if (ctx.chat?.type !== "private") return ctx.reply(t(user.lang, "private_only"));
  return ctx.reply(t(user.lang, "login_confirm_text"), {
    reply_markup: new InlineKeyboard().text(t(user.lang, "btn_login_confirm"), `wc:${code}`),
  });
}

export function registerLogin(bot: Bot) {
  bot.command("login", (ctx) => sendLoginLink(ctx));

  // Переход с сайта: t.me/бот?start=login (ссылка для входа) или start=lg_КОД (вход в браузере, где открыт сайт)
  bot.command("start", async (ctx, next) => {
    const arg = String(ctx.match).trim();
    if (arg === "login") return sendLoginLink(ctx);
    const m = arg.match(/^lg_([0-9a-f]{32})$/);
    if (m) return askBrowserLogin(ctx, m[1]);
    return next();
  });

  // Человек подтвердил вход: браузер, у которого есть секрет этого кода, заберёт сессию
  bot.callbackQuery(/^wc:([0-9a-f]{32})$/, async (ctx) => {
    const code = (ctx.match as RegExpMatchArray)[1];
    const user = await ensureUser(ctx);
    if (!isWlCode(code)) return ctx.answerCallbackQuery();
    await sql`
      insert into login_links (secret, user_id) values (${wlKey(code)}, ${user.id})
      on conflict (secret) do update set user_id = excluded.user_id, created_at = now(), used_at = null`;
    try {
      await ctx.editMessageText(t(user.lang, "login_confirmed"));
    } catch (e) {
      console.error("editMessageText:", e);
    }
    return ctx.answerCallbackQuery();
  });
}
