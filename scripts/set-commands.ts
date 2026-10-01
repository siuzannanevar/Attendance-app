import { Api } from "grammy";
import { privateCommands, groupCommands } from "../src/bot/commands";

// Записывает меню команд в бота на трёх языках. Запускать после изменения commands.ts.
async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Нет TELEGRAM_BOT_TOKEN");
  const api = new Api(token);

  const me = await api.getMe();
  console.log("Бот:", me.username);

  const scopes = [
    { scope: { type: "all_private_chats" as const }, list: privateCommands },
    { scope: { type: "all_group_chats" as const }, list: groupCommands },
  ];

  for (const { scope, list } of scopes) {
    // английский — по умолчанию для всех остальных языков
    await api.setMyCommands(list.en, { scope });
    await api.setMyCommands(list.ru, { scope, language_code: "ru" });
    await api.setMyCommands(list.et, { scope, language_code: "et" });
    console.log("Готово:", scope.type);
  }
}

main().catch((e) => {
  console.error("Ошибка:", e.message);
  process.exit(1);
});
