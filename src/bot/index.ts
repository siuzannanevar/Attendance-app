import { Bot } from "grammy";
import { registerTeams } from "./teams";
import { registerTrainings } from "./trainings";
import { registerLanguage } from "./language";
import { registerSchedule } from "./schedule";

export const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);

registerLanguage(bot);
registerTeams(bot);
registerTrainings(bot);
registerSchedule(bot);

bot.catch((err) => console.error("Bot error:", err.error));
