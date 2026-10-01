// Меню команд бота (кнопка «Меню» и подсказки при вводе «/»).
// Названия команд в Telegram всегда латиницей; подписи — на нужном языке.

export type Cmd = { command: string; description: string };
type ByLang = { en: Cmd[]; ru: Cmd[]; et: Cmd[] };

export const privateCommands: ByLang = {
  en: [
    { command: "start", description: "Start and see what I can do" },
    { command: "newteam", description: "Create a team" },
    { command: "join", description: "Join a team with an invite code" },
    { command: "myteams", description: "My teams and roles" },
    { command: "language", description: "Choose language" },
    { command: "help", description: "Help and list of commands" },
  ],
  ru: [
    { command: "start", description: "Начать и узнать, что я умею" },
    { command: "newteam", description: "Создать команду" },
    { command: "join", description: "Вступить в команду по коду" },
    { command: "myteams", description: "Мои команды и роли" },
    { command: "language", description: "Выбрать язык" },
    { command: "help", description: "Справка и список команд" },
  ],
  et: [
    { command: "start", description: "Alusta ja vaata, mida ma oskan" },
    { command: "newteam", description: "Loo meeskond" },
    { command: "join", description: "Liitu meeskonnaga koodiga" },
    { command: "myteams", description: "Minu meeskonnad ja rollid" },
    { command: "language", description: "Vali keel" },
    { command: "help", description: "Abi ja käskude loend" },
  ],
};

export const groupCommands: ByLang = {
  en: [
    { command: "linkgroup", description: "Link this group to your team" },
    { command: "newtraining", description: "Create a training: DD.MM HH:MM MIN Place" },
    { command: "language", description: "Language of the group's messages" },
    { command: "help", description: "Help and list of commands" },
  ],
  ru: [
    { command: "linkgroup", description: "Привязать эту группу к команде" },
    { command: "newtraining", description: "Создать тренировку: ДД.ММ ЧЧ:ММ МИН Место" },
    { command: "language", description: "Язык сообщений группы" },
    { command: "help", description: "Справка и список команд" },
  ],
  et: [
    { command: "linkgroup", description: "Seo see grupp meeskonnaga" },
    { command: "newtraining", description: "Loo treening: PP.KK HH:MM MIN Koht" },
    { command: "language", description: "Grupisõnumite keel" },
    { command: "help", description: "Abi ja käskude loend" },
  ],
};
