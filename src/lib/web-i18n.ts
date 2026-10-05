import type { Lang } from "@/bot/i18n";

// Тексты сайта на трёх языках
const ru = {
  app_title: "Учёт посещаемости",
  login_title: "Войдите через Telegram",
  login_hint: "Используйте тот же аккаунт Telegram, которым вы пользуетесь с ботом.",
  login_failed: "Не удалось войти. Попробуйте ещё раз.",
  logout: "Выйти",
  my_teams: "Мои команды",
  no_teams: "Вы пока не состоите ни в одной команде. Вступите по коду через бота: /join КОД",
  role_admin: "организатор",
  role_player: "участник",
  back: "← Мои команды",
  schedule: "Расписание",
  no_schedule: "Расписания пока нет.",
  schedule_timing: "Опрос за {poll} ч до тренировки, напоминание за {remind} ч",
  upcoming: "Ближайшие тренировки",
  no_upcoming: "Ближайших тренировок нет.",
  going: "Идут",
  not_going: "Не идут",
  no_answer: "Не ответили",
  your_answer: "Ваш ответ",
  ans_going: "Иду",
  ans_not_going: "Не иду",
  ans_none: "нет ответа",
  members: "Участники",
  not_playing: "не играет",
  bot_hint: "Отвечать на тренировки и управлять командой пока можно в Telegram-боте.",
};

const en: typeof ru = {
  app_title: "Attendance",
  login_title: "Sign in with Telegram",
  login_hint: "Use the same Telegram account you use with the bot.",
  login_failed: "Sign-in failed. Please try again.",
  logout: "Log out",
  my_teams: "My teams",
  no_teams: "You are not in any team yet. Join with a code via the bot: /join CODE",
  role_admin: "organizer",
  role_player: "player",
  back: "← My teams",
  schedule: "Schedule",
  no_schedule: "No schedule yet.",
  schedule_timing: "Poll {poll} h before training, reminder {remind} h before",
  upcoming: "Upcoming trainings",
  no_upcoming: "No upcoming trainings.",
  going: "Going",
  not_going: "Not going",
  no_answer: "No answer yet",
  your_answer: "Your answer",
  ans_going: "I'm in",
  ans_not_going: "I'm out",
  ans_none: "no answer",
  members: "Members",
  not_playing: "not playing",
  bot_hint: "For now, answering and managing the team is done in the Telegram bot.",
};

const et: typeof ru = {
  app_title: "Osalemise arvestus",
  login_title: "Logi sisse Telegramiga",
  login_hint: "Kasuta sama Telegrami kontot, millega kasutad boti.",
  login_failed: "Sisselogimine ei õnnestunud. Proovi uuesti.",
  logout: "Logi välja",
  my_teams: "Minu meeskonnad",
  no_teams: "Sa ei kuulu veel ühessegi meeskonda. Liitu koodiga boti kaudu: /join KOOD",
  role_admin: "korraldaja",
  role_player: "mängija",
  back: "← Minu meeskonnad",
  schedule: "Ajakava",
  no_schedule: "Ajakava pole veel.",
  schedule_timing: "Küsitlus {poll} h enne treeningut, meeldetuletus {remind} h enne",
  upcoming: "Lähimad treeningud",
  no_upcoming: "Lähimaid treeninguid pole.",
  going: "Tulevad",
  not_going: "Ei tule",
  no_answer: "Pole vastanud",
  your_answer: "Sinu vastus",
  ans_going: "Tulen",
  ans_not_going: "Ei tule",
  ans_none: "vastust pole",
  members: "Liikmed",
  not_playing: "ei mängi",
  bot_hint: "Praegu saab vastata ja meeskonda hallata Telegrami botis.",
};

const messages: Record<Lang, typeof ru> = { ru, en, et };
export type WebKey = keyof typeof ru;

export function wt(lang: Lang, key: WebKey, params: Record<string, string | number> = {}): string {
  return messages[lang][key].replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
}
