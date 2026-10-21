import { Bot } from "grammy";
import { registerTeams } from "./teams";
import { registerTrainings } from "./trainings";
import { registerLanguage } from "./language";
import { registerSchedule } from "./schedule";
import { registerMembers } from "./members";
import { registerLogin } from "./login";
import { registerAnswers } from "./answers";
import { registerReserve } from "./reserve";

export const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);

registerLogin(bot); // до registerTeams: перехватывает /start login
registerLanguage(bot);
registerTeams(bot);
registerTrainings(bot);
registerAnswers(bot);
registerSchedule(bot);
registerMembers(bot);
registerReserve(bot);

bot.catch((err) => console.error("Bot error:", err.error));
