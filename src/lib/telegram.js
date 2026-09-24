import TelegramBot from "node-telegram-bot-api";

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);

export async function sendTelegramMessage(text) {
  return bot.sendMessage(process.env.TELEGRAM_CHAT_ID, text);
}