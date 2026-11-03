import "./workers/ingestion.worker";
import "./workers/matching.worker";
import "./workers/dispatch.worker";
import "./workers/ai.worker";
import "./workers/scheduler.worker";
import "./email/digest";
import { bot } from "./telegram/bot";

console.log("🚀 OpenJobPulse workers started");

// Start Telegram bot in webhook or polling mode
if (process.env.TELEGRAM_BOT_TOKEN &&
    process.env.TELEGRAM_BOT_TOKEN !== "placeholder") {
  bot.launch({ dropPendingUpdates: true });
  console.log("🤖 Telegram bot started");
} else {
  console.log("⚠️  Telegram bot token not set — skipping bot");
}

// Graceful shutdown
const shutdown = async () => {
  console.log("Shutting down workers...");
  bot.stop("SIGTERM");
  process.exit(0);
};

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);