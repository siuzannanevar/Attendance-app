// Все тексты бота на трёх языках. Чтобы изменить формулировку — правьте здесь.
// В {фигурных скобках} подставляются значения.

export type Lang = "et" | "ru" | "en";
export const LANGS: Lang[] = ["et", "ru", "en"];

export const LANG_NAMES: Record<Lang, string> = { et: "Eesti", ru: "Русский", en: "English" };
export const LOCALES: Record<Lang, string> = { et: "et-EE", ru: "ru-RU", en: "en-GB" };

export function isLang(x: unknown): x is Lang {
  return typeof x === "string" && (LANGS as string[]).includes(x);
}

// Язык по умолчанию — язык интерфейса Telegram у пользователя
export function pickLang(code?: string | null): Lang {
  const c = (code ?? "").toLowerCase();
  if (c.startsWith("ru")) return "ru";
  if (c.startsWith("et")) return "et";
  return "en";
}

const ru = {
  help:
    "Привет! Я помогаю командам собирать ответы на тренировки.\n\n" +
    "В личном чате со мной:\n" +
    "/newteam Название — создать команду\n" +
    "/join КОД — вступить в команду по коду\n" +
    "/myteams — мои команды\n" +
    "/language — выбрать язык\n\n" +
    "В группе команды (для организатора):\n" +
    "/linkgroup — привязать группу к команде\n" +
    "/newtraining ДД.ММ ЧЧ:ММ МИН Место — создать тренировку\n" +
    "/language — язык сообщений группы",

  newteam_private: "Команду лучше создавать в личном чате со мной.",
  newteam_usage: "Напишите название: /newteam Волейбол колледж",
  team_created:
    "Команда «{name}» создана, вы организатор.\nКод для вступления игроков: {code}\n\n" +
    "Отправьте этот код игрокам. Они вступают командой /join {code} в личном чате со мной.",

  join_private: "Код лучше отправлять мне в личные сообщения, чтобы его не видела вся группа.",
  join_usage: "Напишите код: /join ABC234",
  join_bad: "Код не найден или отозван.",
  joined: "Вы в команде «{name}».",

  no_teams: "Вы пока не состоите ни в одной команде.",
  role_admin: "организатор",
  role_player: "участник",

  linkgroup_private: "Эту команду нужно написать в группе, которую вы хотите привязать.",
  linkgroup_no_team:
    "Команда, где вы организатор, не найдена. Проверьте название или создайте команду: /newteam в личном чате со мной.",
  linkgroup_many: "У вас несколько команд. Укажите название: /linkgroup Название\n{list}",
  linkgroup_fail: "Не получилось привязать: возможно, эта группа уже привязана к другой команде.",
  linkgroup_ok:
    "Группа привязана к команде «{name}». Теперь организатор может создавать тренировки: /newtraining",

  newtraining_private: "Эту команду нужно писать в группе команды (после /linkgroup).",
  newtraining_notlinked:
    "Эта группа не привязана к команде, или вы не организатор этой команды. Привязка: /linkgroup",
  newtraining_format:
    "Формат: /newtraining ДД.ММ ЧЧ:ММ МИН_ИГРОКОВ Место\nПример: /newtraining 15.10 19:00 12 Спортзал колледжа",
  newtraining_baddate: "Похоже, дата или время указаны неверно. Пример: 15.10 19:00",
  newtraining_nodate: "Не получилось определить дату. Пример: 15.10 19:00",

  poll_title: "📅 {team}: тренировка",
  poll_going: "✅ Идут ({count}):",
  poll_not_going: "❌ Не идут: {n}",
  poll_no_answer: "⏳ Не ответили: {n}",
  btn_going: "✅ Иду",
  btn_not_going: "❌ Не иду",

  cb_not_found: "Тренировка не найдена.",
  cb_past: "Эта тренировка уже прошла.",
  cb_not_member:
    "Сначала вступите в команду: откройте бота в личных сообщениях и отправьте /join КОД",
  cb_already: "Ваш ответ уже записан.",
  cb_saved_going: "Ответ записан: иду ✅",
  cb_saved_not_going: "Ответ записан: не иду ❌",

  lang_choose_user: "Language / Keel / Язык:",
  lang_choose_group: "Group language / Grupi keel / Язык группы:",
  lang_saved_user: "Язык: {language}.",
  lang_saved_group: "Язык сообщений группы: {language}.",
  lang_group_not_linked: "Сначала привяжите группу: /linkgroup",
  lang_group_not_admin: "Менять язык группы может только организатор команды.",
};

const en: typeof ru = {
  help:
    "Hi! I help teams collect attendance for trainings.\n\n" +
    "In a private chat with me:\n" +
    "/newteam Name — create a team\n" +
    "/join CODE — join a team with an invite code\n" +
    "/myteams — my teams\n" +
    "/language — choose language\n\n" +
    "In the team's group (for organizers):\n" +
    "/linkgroup — link this group to your team\n" +
    "/newtraining DD.MM HH:MM MIN Place — create a training\n" +
    "/language — language of the group's messages",

  newteam_private: "Please create a team in a private chat with me.",
  newteam_usage: "Add a name: /newteam College volleyball",
  team_created:
    "Team “{name}” created, you are the organizer.\nInvite code for players: {code}\n\n" +
    "Share this code with your players. They join with /join {code} in a private chat with me.",

  join_private: "Please send the code to me in a private chat so the whole group doesn't see it.",
  join_usage: "Add the code: /join ABC234",
  join_bad: "Code not found or revoked.",
  joined: "You joined “{name}”.",

  no_teams: "You are not in any team yet.",
  role_admin: "organizer",
  role_player: "player",

  linkgroup_private: "Send this command in the group you want to link.",
  linkgroup_no_team:
    "No team found where you are an organizer. Check the name or create a team with /newteam in a private chat with me.",
  linkgroup_many: "You have several teams. Add the name: /linkgroup Name\n{list}",
  linkgroup_fail: "Could not link: this group may already be linked to another team.",
  linkgroup_ok:
    "The group is linked to team “{name}”. Organizers can now create trainings: /newtraining",

  newtraining_private: "Use this command in the team's group (after /linkgroup).",
  newtraining_notlinked:
    "This group is not linked to a team, or you are not an organizer of that team. Link it with /linkgroup",
  newtraining_format:
    "Format: /newtraining DD.MM HH:MM MIN_PLAYERS Place\nExample: /newtraining 15.10 19:00 12 College gym",
  newtraining_baddate: "The date or time looks invalid. Example: 15.10 19:00",
  newtraining_nodate: "Could not work out the date. Example: 15.10 19:00",

  poll_title: "📅 {team}: training",
  poll_going: "✅ Going ({count}):",
  poll_not_going: "❌ Not going: {n}",
  poll_no_answer: "⏳ No answer yet: {n}",
  btn_going: "✅ I'm in",
  btn_not_going: "❌ I'm out",

  cb_not_found: "Training not found.",
  cb_past: "This training has already taken place.",
  cb_not_member:
    "Join the team first: open the bot in a private chat and send /join CODE",
  cb_already: "Your answer is already saved.",
  cb_saved_going: "Saved: you're going ✅",
  cb_saved_not_going: "Saved: you're not going ❌",

  lang_choose_user: "Language / Keel / Язык:",
  lang_choose_group: "Group language / Grupi keel / Язык группы:",
  lang_saved_user: "Language: {language}.",
  lang_saved_group: "Group language: {language}.",
  lang_group_not_linked: "Link the group first: /linkgroup",
  lang_group_not_admin: "Only a team organizer can change the group language.",
};

const et: typeof ru = {
  help:
    "Tere! Aitan meeskondadel treeningutel osalemist kokku koguda.\n\n" +
    "Privaatvestluses minuga:\n" +
    "/newteam Nimi — loo meeskond\n" +
    "/join KOOD — liitu meeskonnaga kutsekoodiga\n" +
    "/myteams — minu meeskonnad\n" +
    "/language — vali keel\n\n" +
    "Meeskonna grupis (korraldajale):\n" +
    "/linkgroup — seo see grupp oma meeskonnaga\n" +
    "/newtraining PP.KK HH:MM MIN Koht — loo treening\n" +
    "/language — grupisõnumite keel",

  newteam_private: "Palun loo meeskond minuga privaatvestluses.",
  newteam_usage: "Lisa nimi: /newteam Kolledži võrkpall",
  team_created:
    "Meeskond „{name}” on loodud, sina oled korraldaja.\nMängijate kutsekood: {code}\n\n" +
    "Jaga seda koodi mängijatega. Nad liituvad käsuga /join {code} privaatvestluses minuga.",

  join_private: "Palun saada kood mulle privaatsõnumina, et kogu grupp seda ei näeks.",
  join_usage: "Lisa kood: /join ABC234",
  join_bad: "Koodi ei leitud või see on tühistatud.",
  joined: "Liitusid meeskonnaga „{name}”.",

  no_teams: "Sa ei kuulu veel ühessegi meeskonda.",
  role_admin: "korraldaja",
  role_player: "mängija",

  linkgroup_private: "Saada see käsk grupis, mida soovid siduda.",
  linkgroup_no_team:
    "Meeskonda, kus sa oled korraldaja, ei leitud. Kontrolli nime või loo meeskond käsuga /newteam privaatvestluses minuga.",
  linkgroup_many: "Sul on mitu meeskonda. Lisa nimi: /linkgroup Nimi\n{list}",
  linkgroup_fail: "Sidumine ei õnnestunud: see grupp võib olla juba teise meeskonnaga seotud.",
  linkgroup_ok:
    "Grupp on seotud meeskonnaga „{name}”. Nüüd saab korraldaja treeninguid luua: /newtraining",

  newtraining_private: "Kasuta seda käsku meeskonna grupis (pärast /linkgroup).",
  newtraining_notlinked:
    "See grupp pole meeskonnaga seotud või sa pole selle meeskonna korraldaja. Seo grupp käsuga /linkgroup",
  newtraining_format:
    "Vorming: /newtraining PP.KK HH:MM MIN_MÄNGIJAID Koht\nNäide: /newtraining 15.10 19:00 12 Kolledži spordisaal",
  newtraining_baddate: "Kuupäev või kellaaeg tundub vale. Näide: 15.10 19:00",
  newtraining_nodate: "Kuupäeva ei õnnestunud tuvastada. Näide: 15.10 19:00",

  poll_title: "📅 {team}: treening",
  poll_going: "✅ Tulevad ({count}):",
  poll_not_going: "❌ Ei tule: {n}",
  poll_no_answer: "⏳ Pole vastanud: {n}",
  btn_going: "✅ Tulen",
  btn_not_going: "❌ Ei tule",

  cb_not_found: "Treeningut ei leitud.",
  cb_past: "See treening on juba toimunud.",
  cb_not_member:
    "Liitu kõigepealt meeskonnaga: ava bot privaatvestluses ja saada /join KOOD",
  cb_already: "Sinu vastus on juba salvestatud.",
  cb_saved_going: "Salvestatud: tuled ✅",
  cb_saved_not_going: "Salvestatud: sa ei tule ❌",

  lang_choose_user: "Language / Keel / Язык:",
  lang_choose_group: "Group language / Grupi keel / Язык группы:",
  lang_saved_user: "Keel: {language}.",
  lang_saved_group: "Grupi keel: {language}.",
  lang_group_not_linked: "Seo kõigepealt grupp: /linkgroup",
  lang_group_not_admin: "Grupi keelt saab muuta ainult meeskonna korraldaja.",
};

const messages: Record<Lang, typeof ru> = { ru, en, et };

export type MsgKey = keyof typeof ru;

export function t(lang: Lang, key: MsgKey, params: Record<string, string | number> = {}): string {
  // Один проход: вставленный текст (например, название команды) повторно не обрабатывается
  return messages[lang][key].replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
}
