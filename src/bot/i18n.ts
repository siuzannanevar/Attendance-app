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
    "Привет! Я помогаю командам собирать ответы на тренировки.\n" +
    "\n" +
    "В личном чате со мной:\n" +
    "/newteam Название — создать команду\n" +
    "/join КОД — вступить в команду по коду\n" +
    "/newschedule ДНИ ЧЧ:ММ МИН Место — регулярные тренировки (опросы и напоминания приходят сами)\n" +
    "/schedule — расписание\n" +
    "/timing ОПРОС НАПОМИНАНИЕ — за сколько часов публиковать (по умолчанию 48 и 24)\n" +
    "/newtraining ДД.ММ ЧЧ:ММ МИН Место — разовая тренировка\n" +
    "/members — участники команды (удалить, не считать себя)\n" +
    "/leave — выйти из команды\n" +
    "/myteams — мои команды\n" +
    "/language — выбрать язык\n" +
    "\n" +
    "В группе команды (один раз, для организатора):\n" +
    "/linkgroup — привязать группу к команде\n" +
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

  newtraining_notlinked:
    "Эта группа не привязана к команде, или вы не организатор этой команды. Привязка: /linkgroup",
  newtraining_format:
    "Формат: /newtraining ДД.ММ ЧЧ:ММ МИН_ИГРОКОВ Место\nПример: /newtraining 15.10 19:00 12 Спортзал колледжа",
  newtraining_baddate: "Похоже, дата или время указаны неверно. Пример: 15.10 19:00",
  newtraining_nodate: "Не получилось определить дату. Пример: 15.10 19:00",
  newtraining_no_admin_team: "Вы не организатор ни одной команды. Создайте команду: /newteam",
  newtraining_group_missing:
    "Группа команды «{team}» ещё не привязана. Добавьте бота в группу команды и отправьте там /linkgroup",
  newtraining_choose_team: "Для какой команды создать тренировку?",
  newtraining_expired: "Черновик тренировки устарел. Отправьте /newtraining ещё раз.",
  training_published: "Готово: опрос о тренировке отправлен в группу команды «{team}».",
  newtraining_post_failed:
    "Не получилось отправить опрос в группу. Проверьте, что бот добавлен в группу и может писать сообщения.",

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

  private_only: "Эту команду нужно писать мне в личные сообщения.",
  not_organizer: "Это действие доступно только организатору команды.",
  choose_team: "Для какой команды?",

  schedule_usage:
    "Формат: /newschedule ДНИ ЧЧ:ММ МИН Место\nПример: /newschedule ср,пт 19:00 12 Спортзал колледжа\nДни: пн, вт, ср, чт, пт, сб, вс (или цифры 1–7)",
  schedule_bad_day:
    "Не понимаю день недели «{day}». Используйте: пн, вт, ср, чт, пт, сб, вс или цифры 1–7.",
  schedule_bad_time: "Время указано неверно. Пример: 19:00",
  schedule_added:
    "✅ Расписание добавлено: {slots}.\nОпрос приходит в группу за {poll} ч до тренировки, напоминание — за {remind} ч.\nПосмотреть и изменить: /schedule",
  schedule_no_group:
    "⚠️ Группа команды ещё не привязана, поэтому опросы пока не будут публиковаться. Добавьте бота в группу и отправьте там /linkgroup.",
  schedule_timing_line: "Опрос: за {poll} ч до тренировки · напоминание: за {remind} ч",
  schedule_empty: "Расписания пока нет. Добавьте: /newschedule",
  slot_deleted: "Удалено",

  timing_usage:
    "Формат: /timing ОПРОС НАПОМИНАНИЕ (в часах до тренировки)\nПример: /timing 48 24 — опрос за 48 ч, напоминание за 24 ч",
  timing_bad:
    "Числа должны быть от 1 до 336, и опрос должен идти раньше напоминания (первое число не меньше второго).",
  timing_saved: "Сохранено для «{team}»: опрос за {poll} ч, напоминание за {remind} ч до тренировки.",

  reminder_group:
    "⏰ Скоро тренировка: {when}.\nПока идут: {count}.\nЕщё не ответили: {names}\nПожалуйста, нажмите кнопку в опросе.",
  alert_shortage:
    "⚠️ {team}: на тренировку {when} пока идут {going} из {needed}. Не хватает: {missing}.",
  btn_call: "🆘 Позвать ещё в группе",
  btn_invite_text: "📋 Текст для приглашения",
  call_group:
    "🆘 Нужно ещё игроков: {missing}! Тренировка {when}. Нажмите «Иду» в опросе выше или позовите друга.",
  call_sent: "Отправлено в группу.",
  call_enough: "Игроков уже достаточно.",
  invite_text:
    "{team}: ищем игроков на тренировку {when}{place}. Нужно ещё {missing}. Пишите: {contact}",
  invite_text_hint: "Перешлите это сообщение в другие чаты:",

  members_not_playing: " · не играет",
  btn_play_off: "🚫 Я не играю — не считать меня",
  btn_play_on: "🏃 Я играю — считать меня",
  play_saved_on: "Теперь вы учитываетесь в счётчике.",
  play_saved_off: "Вас больше не считают среди неответивших.",
  member_removed: "Удалено: {name}",
  cannot_remove_self: "Себя удалить нельзя. Чтобы выйти из команды, используйте /leave",
  you_were_removed: "Организатор удалил вас из команды «{team}».",
  leave_choose: "Из какой команды выйти?",
  leave_confirm: "Выйти из команды «{team}»? Ваши ответы на будущие тренировки будут удалены.",
  btn_yes_leave: "Да, выйти",
  btn_cancel: "Отмена",
  leave_done: "Вы вышли из команды «{team}».",
  leave_last_admin: "Вы единственный организатор этой команды, поэтому выйти нельзя.",
  leave_cancelled: "Отменено.",

  members_hint: "👑 — назначить организатором, ⬇️ — снять роль, 🗑 — удалить из команды.",
  owner_only: "Менять роль и удалять организаторов может только создатель команды.",
  promoted: "{name} теперь организатор.",
  demoted: "{name} больше не организатор.",
  you_are_organizer:
    "Вас назначили организатором команды «{team}». Теперь вам доступны /newtraining, /newschedule, /members и другие команды организатора.",
  you_not_organizer: "Вы больше не организатор команды «{team}».",

  lang_choose_user: "Language / Keel / Язык:",
  lang_choose_group: "Group language / Grupi keel / Язык группы:",
  lang_saved_user: "Язык: {language}.",
  lang_saved_group: "Язык сообщений группы: {language}.",
  lang_group_not_linked: "Сначала привяжите группу: /linkgroup",
  lang_group_not_admin: "Менять язык группы может только организатор команды.",
};

const en: typeof ru = {
  help:
    "Hi! I help teams collect attendance for trainings.\n" +
    "\n" +
    "In a private chat with me:\n" +
    "/newteam Name — create a team\n" +
    "/join CODE — join a team with an invite code\n" +
    "/newschedule DAYS HH:MM MIN Place — recurring trainings (polls and reminders are sent automatically)\n" +
    "/schedule — the schedule\n" +
    "/timing POLL REMINDER — how many hours before to post (default 48 and 24)\n" +
    "/newtraining DD.MM HH:MM MIN Place — a one-off training\n" +
    "/members — team members (remove, mark yourself as not playing)\n" +
    "/leave — leave a team\n" +
    "/myteams — my teams\n" +
    "/language — choose language\n" +
    "\n" +
    "In the team's group (once, for organizers):\n" +
    "/linkgroup — link this group to your team\n" +
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

  newtraining_notlinked:
    "This group is not linked to a team, or you are not an organizer of that team. Link it with /linkgroup",
  newtraining_format:
    "Format: /newtraining DD.MM HH:MM MIN_PLAYERS Place\nExample: /newtraining 15.10 19:00 12 College gym",
  newtraining_baddate: "The date or time looks invalid. Example: 15.10 19:00",
  newtraining_nodate: "Could not work out the date. Example: 15.10 19:00",
  newtraining_no_admin_team: "You are not an organizer of any team. Create one: /newteam",
  newtraining_group_missing:
    "The group of team “{team}” is not linked yet. Add the bot to the team's group and send /linkgroup there.",
  newtraining_choose_team: "Which team is the training for?",
  newtraining_expired: "The training draft has expired. Please send /newtraining again.",
  training_published: "Done: the training poll has been sent to the group of “{team}”.",
  newtraining_post_failed:
    "Could not send the poll to the group. Make sure the bot is in the group and can post messages.",

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

  private_only: "Please send this command to me in a private chat.",
  not_organizer: "Only a team organizer can do this.",
  choose_team: "Which team?",

  schedule_usage:
    "Format: /newschedule DAYS HH:MM MIN Place\nExample: /newschedule wed,fri 19:00 12 College gym\nDays: mon, tue, wed, thu, fri, sat, sun (or numbers 1–7)",
  schedule_bad_day:
    "I don't understand the weekday “{day}”. Use: mon, tue, wed, thu, fri, sat, sun or numbers 1–7.",
  schedule_bad_time: "The time looks invalid. Example: 19:00",
  schedule_added:
    "✅ Schedule added: {slots}.\nThe poll is posted to the group {poll} h before training, the reminder {remind} h before.\nView and edit: /schedule",
  schedule_no_group:
    "⚠️ The team's group is not linked yet, so polls will not be posted. Add the bot to the group and send /linkgroup there.",
  schedule_timing_line: "Poll: {poll} h before training · reminder: {remind} h before",
  schedule_empty: "No schedule yet. Add one: /newschedule",
  slot_deleted: "Deleted",

  timing_usage:
    "Format: /timing POLL REMINDER (hours before training)\nExample: /timing 48 24 — poll 48 h before, reminder 24 h before",
  timing_bad:
    "Numbers must be between 1 and 336, and the poll must come before the reminder (first number not smaller than the second).",
  timing_saved: "Saved for “{team}”: poll {poll} h before, reminder {remind} h before.",

  reminder_group:
    "⏰ Training soon: {when}.\nGoing so far: {count}.\nNo answer yet: {names}\nPlease press a button in the poll.",
  alert_shortage:
    "⚠️ {team}: for the training on {when}, {going} of {needed} are going. Missing: {missing}.",
  btn_call: "🆘 Call for players in the group",
  btn_invite_text: "📋 Invitation text",
  call_group:
    "🆘 We need {missing} more players! Training {when}. Press “I'm in” in the poll above or bring a friend.",
  call_sent: "Sent to the group.",
  call_enough: "There are already enough players.",
  invite_text:
    "{team}: looking for players for training {when}{place}. {missing} more needed. Contact: {contact}",
  invite_text_hint: "Forward this message to other chats:",

  members_not_playing: " · not playing",
  btn_play_off: "🚫 I don't play — don't count me",
  btn_play_on: "🏃 I play — count me",
  play_saved_on: "You are now counted in the poll.",
  play_saved_off: "You are no longer counted among those who haven't answered.",
  member_removed: "Removed: {name}",
  cannot_remove_self: "You can't remove yourself. To leave the team, use /leave",
  you_were_removed: "An organizer removed you from team “{team}”.",
  leave_choose: "Which team do you want to leave?",
  leave_confirm: "Leave team “{team}”? Your answers for upcoming trainings will be removed.",
  btn_yes_leave: "Yes, leave",
  btn_cancel: "Cancel",
  leave_done: "You left “{team}”.",
  leave_last_admin: "You are the only organizer of this team, so you can't leave.",
  leave_cancelled: "Cancelled.",

  members_hint: "👑 — make organizer, ⬇️ — remove organizer role, 🗑 — remove from team.",
  owner_only: "Only the team's creator can change or remove organizers.",
  promoted: "{name} is now an organizer.",
  demoted: "{name} is no longer an organizer.",
  you_are_organizer:
    "You have been made an organizer of team “{team}”. You can now use /newtraining, /newschedule, /members and other organizer commands.",
  you_not_organizer: "You are no longer an organizer of team “{team}”.",

  lang_choose_user: "Language / Keel / Язык:",
  lang_choose_group: "Group language / Grupi keel / Язык группы:",
  lang_saved_user: "Language: {language}.",
  lang_saved_group: "Group language: {language}.",
  lang_group_not_linked: "Link the group first: /linkgroup",
  lang_group_not_admin: "Only a team organizer can change the group language.",
};

const et: typeof ru = {
  help:
    "Tere! Aitan meeskondadel treeningutel osalemist kokku koguda.\n" +
    "\n" +
    "Privaatvestluses minuga:\n" +
    "/newteam Nimi — loo meeskond\n" +
    "/join KOOD — liitu meeskonnaga kutsekoodiga\n" +
    "/newschedule PÄEVAD HH:MM MIN Koht — regulaarsed treeningud (küsitlused ja meeldetuletused tulevad ise)\n" +
    "/schedule — ajakava\n" +
    "/timing KÜSITLUS MEELDETULETUS — mitu tundi enne postitada (vaikimisi 48 ja 24)\n" +
    "/newtraining PP.KK HH:MM MIN Koht — ühekordne treening\n" +
    "/members — meeskonna liikmed (eemalda, ära arvesta ennast)\n" +
    "/leave — lahku meeskonnast\n" +
    "/myteams — minu meeskonnad\n" +
    "/language — vali keel\n" +
    "\n" +
    "Meeskonna grupis (üks kord, korraldajale):\n" +
    "/linkgroup — seo see grupp oma meeskonnaga\n" +
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

  newtraining_notlinked:
    "See grupp pole meeskonnaga seotud või sa pole selle meeskonna korraldaja. Seo grupp käsuga /linkgroup",
  newtraining_format:
    "Vorming: /newtraining PP.KK HH:MM MIN_MÄNGIJAID Koht\nNäide: /newtraining 15.10 19:00 12 Kolledži spordisaal",
  newtraining_baddate: "Kuupäev või kellaaeg tundub vale. Näide: 15.10 19:00",
  newtraining_nodate: "Kuupäeva ei õnnestunud tuvastada. Näide: 15.10 19:00",
  newtraining_no_admin_team: "Sa ei ole ühegi meeskonna korraldaja. Loo meeskond: /newteam",
  newtraining_group_missing:
    "Meeskonna „{team}” grupp pole veel seotud. Lisa bot meeskonna gruppi ja saada seal /linkgroup.",
  newtraining_choose_team: "Millise meeskonna treening see on?",
  newtraining_expired: "Treeningu mustand aegus. Saada /newtraining uuesti.",
  training_published: "Valmis: treeningu küsitlus saadeti meeskonna „{team}” gruppi.",
  newtraining_post_failed:
    "Küsitlust ei õnnestunud gruppi saata. Veendu, et bot on grupis ja saab sõnumeid saata.",

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

  private_only: "Palun saada see käsk mulle privaatsõnumina.",
  not_organizer: "See on kättesaadav ainult meeskonna korraldajale.",
  choose_team: "Millise meeskonna jaoks?",

  schedule_usage:
    "Vorming: /newschedule PÄEVAD HH:MM MIN Koht\nNäide: /newschedule k,r 19:00 12 Kolledži spordisaal\nPäevad: e, t, k, n, r, l, p (või numbrid 1–7)",
  schedule_bad_day:
    "Ma ei saa nädalapäevast „{day}” aru. Kasuta: e, t, k, n, r, l, p või numbreid 1–7.",
  schedule_bad_time: "Kellaaeg tundub vale. Näide: 19:00",
  schedule_added:
    "✅ Ajakava lisatud: {slots}.\nKüsitlus postitatakse gruppi {poll} h enne treeningut, meeldetuletus {remind} h enne.\nVaata ja muuda: /schedule",
  schedule_no_group:
    "⚠️ Meeskonna gruppi pole veel seotud, seetõttu küsitlusi ei postitata. Lisa bot gruppi ja saada seal /linkgroup.",
  schedule_timing_line: "Küsitlus: {poll} h enne treeningut · meeldetuletus: {remind} h enne",
  schedule_empty: "Ajakava pole veel. Lisa: /newschedule",
  slot_deleted: "Kustutatud",

  timing_usage:
    "Vorming: /timing KÜSITLUS MEELDETULETUS (tunnid enne treeningut)\nNäide: /timing 48 24 — küsitlus 48 h enne, meeldetuletus 24 h enne",
  timing_bad:
    "Arvud peavad olema vahemikus 1–336 ja küsitlus peab tulema enne meeldetuletust (esimene arv ei tohi olla väiksem kui teine).",
  timing_saved: "Salvestatud meeskonnale „{team}”: küsitlus {poll} h enne, meeldetuletus {remind} h enne.",

  reminder_group:
    "⏰ Peagi on treening: {when}.\nPraegu tulevad: {count}.\nPole vastanud: {names}\nPalun vajuta küsitluses nuppu.",
  alert_shortage:
    "⚠️ {team}: treeninguks {when} tuleb praegu {going}/{needed}. Puudu: {missing}.",
  btn_call: "🆘 Kutsu gruppi lisamängijaid",
  btn_invite_text: "📋 Kutsetekst",
  call_group:
    "🆘 Vaja on veel {missing} mängijat! Treening {when}. Vajuta ülal küsitluses „Tulen” või too sõber kaasa.",
  call_sent: "Gruppi saadetud.",
  call_enough: "Mängijaid on juba piisavalt.",
  invite_text:
    "{team}: otsime mängijaid treeninguks {when}{place}. Vaja on veel {missing}. Kontakt: {contact}",
  invite_text_hint: "Edasta see sõnum teistesse vestlustesse:",

  members_not_playing: " · ei mängi",
  btn_play_off: "🚫 Ma ei mängi — ära arvesta mind",
  btn_play_on: "🏃 Ma mängin — arvesta mind",
  play_saved_on: "Sind arvestatakse nüüd küsitluses.",
  play_saved_off: "Sind ei loeta enam vastamata jätnute hulka.",
  member_removed: "Eemaldatud: {name}",
  cannot_remove_self: "Iseennast ei saa eemaldada. Meeskonnast lahkumiseks kasuta /leave",
  you_were_removed: "Korraldaja eemaldas sind meeskonnast „{team}”.",
  leave_choose: "Millisest meeskonnast soovid lahkuda?",
  leave_confirm: "Kas lahkuda meeskonnast „{team}”? Sinu vastused tulevastele treeningutele kustutatakse.",
  btn_yes_leave: "Jah, lahku",
  btn_cancel: "Tühista",
  leave_done: "Lahkusid meeskonnast „{team}”.",
  leave_last_admin: "Sa oled selle meeskonna ainus korraldaja, seega ei saa lahkuda.",
  leave_cancelled: "Tühistatud.",

  members_hint: "👑 — määra korraldajaks, ⬇️ — võta korraldaja roll, 🗑 — eemalda meeskonnast.",
  owner_only: "Organisaatorite rolli muuta ja neid eemaldada saab ainult meeskonna looja.",
  promoted: "{name} on nüüd korraldaja.",
  demoted: "{name} ei ole enam korraldaja.",
  you_are_organizer:
    "Sind määrati meeskonna „{team}” korraldajaks. Nüüd saad kasutada käske /newtraining, /newschedule, /members ja teisi korraldaja käske.",
  you_not_organizer: "Sa ei ole enam meeskonna „{team}” korraldaja.",

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
