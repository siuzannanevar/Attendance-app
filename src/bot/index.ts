import { Bot } from "grammy";
import { registerTeams } from "./teams";
import { registerTrainings } from "./trainings";
import { registerLanguage } from "./language";
import { registerSchedule } from "./schedule";
import { registerMembers } from "./members";
import { registerLogin } from "./login";

export const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);

registerLogin(bot); // до registerTeams: перехватывает /start login
registerLanguage(bot);
registerTeams(bot);
registerTrainings(bot);
registerSchedule(bot);
registerMembers(bot);

bot.catch((err) => console.error("Bot error:", err.error));
