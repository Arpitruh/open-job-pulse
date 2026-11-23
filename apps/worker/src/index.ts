import "./workers/ingestion.worker";
import "./workers/matching.worker";
import "./workers/dispatch.worker";
import "./workers/ai.worker";
import "./workers/scheduler.worker";
import "./email/digest";
import { bot } from "./telegram/bot";
import { redisConnection, ingestionQueue, matchingQueue, dispatchQueue, aiQueue, schedulerQueue } from "@ojp/queue";
import { db } from "@ojp/db";

// A short-lived Redis heartbeat lets administrators distinguish an online worker
// from a healthy web deployment. No public endpoint or user data is involved.
const HEARTBEAT_KEY = "ojp:worker:heartbeat";
const HEARTBEAT_TTL_SECONDS = 90;
let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
let telegramStarted = false;
let stopping = false;

async function writeHeartbeat() {
  try {
    await redisConnection.set(HEARTBEAT_KEY, new Date().toISOString(), "EX", HEARTBEAT_TTL_SECONDS);
  } catch (error) {
    console.error("[Worker] Redis heartbeat failed:", error);
  }
}

async function main() {
  try {
    await redisConnection.ping();
    console.log("[Worker] Redis connection ready");
  } catch (error) {
    console.error("[Worker] Redis connection failed:", error);
    process.exitCode = 1;
    await shutdown();
    return;
  }

  await writeHeartbeat();
  heartbeatTimer = setInterval(() => { void writeHeartbeat(); }, 30_000);

  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN !== "placeholder") {
    try {
      await bot.launch({ dropPendingUpdates: true });
      telegramStarted = true;
      console.log("[Worker] Telegram bot started");
    } catch (error) {
      console.error("[Worker] Telegram bot could not start; background queues remain active:", error);
    }
  } else {
    console.log("[Worker] Telegram integration disabled");
  }
  console.log("[Worker] Background consumers started");
}

async function shutdown() {
  if (stopping) return;
  stopping = true;
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  console.log("[Worker] Graceful shutdown initiated");
  if (telegramStarted) bot.stop("SIGTERM");
  // Stop accepting jobs before closing the shared Redis/Prisma connections.
  const results = await Promise.allSettled([
    ingestionQueue.close(), matchingQueue.close(), dispatchQueue.close(),
    aiQueue.close(), schedulerQueue.close(), db.$disconnect(),
  ]);
  for (const result of results) {
    if (result.status === "rejected") console.error("[Worker] Shutdown error:", result.reason);
  }
  try { await redisConnection.del(HEARTBEAT_KEY); } catch {}
  redisConnection.disconnect();
  console.log("[Worker] Shutdown complete");
}

process.once("SIGTERM", () => { void shutdown(); });
process.once("SIGINT", () => { void shutdown(); });
void main();
