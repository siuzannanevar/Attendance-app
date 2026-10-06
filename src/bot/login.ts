import { randomBytes } from "crypto";
import { InlineKeyboard } from "grammy";
import type { Bot, Context } from "grammy";
import { sql } from "@/lib/db";
import { ensureUser } from "./helpers";
import { t } from "./i18n";

const siteUrl = () => process.env.SITE_URL ?? "https://attendance-app-siuzanna.vercel.app";

// Выдаёт одноразовую ссылку для входа на сайт. Ссылка уходит только в личный чат этого человека.
async function sendLoginLink(ctx: Context) {
  const user = await ensureUser(ctx);
  if (ctx.chat?.type !== "private") return ctx.reply(t(user.lang, "private_only"));

  const secret = randomBytes(24).toString("hex");
  await sql`insert into login_links (secret, user_id) values (${secret}, ${user.id})`;
  const link = `${siteUrl()}/api/auth/confirm?s=${secret}`;

  return ctx.reply(t(user.lang, "login_link_text"), {
    reply_markup: new InlineKeyboard().url(t(user.lang, "btn_open_site"), link),
  });
}

export function registerLogin(bot: Bot) {
  bot.command("login", (ctx) => sendLoginLink(ctx));

  // Переход с сайта по ссылке t.me/бот?start=login
  bot.command("start", async (ctx, next) => {
    if (String(ctx.match).trim() === "login") return sendLoginLink(ctx);
    return next();
  });
}
