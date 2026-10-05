import { webhookCallback } from "grammy";
import { bot } from "@/bot";

export const dynamic = "force-dynamic";

export const POST = webhookCallback(bot, "std/http", {
  secretToken: process.env.TELEGRAM_WEBHOOK_SECRET,
});