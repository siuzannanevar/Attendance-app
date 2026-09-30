import { bot } from "../src/bot";

async function main() {
  await bot.api.deleteWebhook(); // локально бот работает через polling, вебхук не нужен
  console.log("dev-бот запущен. Остановить: Ctrl+C");
  await bot.start();
}

main();
