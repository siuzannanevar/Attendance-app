import { Bot } from "grammy";
import { registerTeams } from "./teams";
import { registerTrainings } from "./trainings";
import { registerLanguage } from "./language";

export const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);

registerLanguage(bot);
registerTeams(bot);
registerTrainings(bot);

bot.catch((err) => console.error("Bot error:", err.error));
