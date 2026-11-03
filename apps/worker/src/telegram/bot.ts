import { Telegraf, Markup } from "telegraf";
import { db } from "@ojp/db";
import { Redis } from "ioredis";

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN ?? "placeholder");

const publisher = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// ── Format match message ──────────────────────────────────────────────────────
export function formatMatchMessage(match: any): string {
  const { jobListing: jl, similarityScore } = match;
  const score = Math.round(similarityScore * 100);

  const salaryText =
    jl.baseSalaryMin
      ? `💰 ${jl.currency ?? "$"}${Math.round(jl.baseSalaryMin / 1000)}k${
          jl.baseSalaryMax
            ? `–${Math.round(jl.baseSalaryMax / 1000)}k`
            : "+"
        }`
      : "";

  const modeEmoji: Record<string, string> = {
    REMOTE: "🌍",
    HYBRID: "🏢🏠",
    ON_SITE: "🏢",
  };

  return [
    `🎯 <b>New Job Match — ${score}% fit</b>`,
    ``,
    `<b>${jl.jobTitle}</b>`,
    `🏢 ${jl.companyName}`,
    `${modeEmoji[jl.workMode] ?? "📍"} ${jl.workMode.replace("_", " ")}`,
    salaryText,
    ``,
    `📋 ${jl.sourcePortal}`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ── Send match notification ───────────────────────────────────────────────────
export async function sendMatchNotification(
  chatId: string,
  match: any
): Promise<boolean> {
  try {
    const message = formatMatchMessage(match);

    await bot.telegram.sendMessage(chatId, message, {
      parse_mode: "HTML",
      reply_markup: Markup.inlineKeyboard([
        [
          Markup.button.url("🔗 View Job", match.jobListing.applyUrl),
          Markup.button.callback("✅ Mark Applied", `apply:${match.id}`),
        ],
        [
          Markup.button.callback("📦 Archive", `archive:${match.id}`),
          Markup.button.callback("❌ Reject", `reject:${match.id}`),
        ],
      ]).reply_markup,
    });

    return true;
  } catch (err: any) {
    console.error("[Telegram Bot] Send failed:", err.message);
    return false;
  }
}

// ── Handle inline button callbacks ───────────────────────────────────────────
bot.action(/^(apply|archive|reject):(.+)$/, async (ctx) => {
  const action = ctx.match[1] as string | undefined;
  const matchId = ctx.match[2] as string | undefined;

  if (!action || !matchId) {
    await ctx.answerCbQuery("Invalid action");
    return;
  }

  const statusMap: Record<string, string> = {
    apply: "APPLIED",
    archive: "ARCHIVED",
    reject: "REJECTED",
  };

  const newStatus = statusMap[action];
  if (!newStatus) {
    await ctx.answerCbQuery("Unknown action");
    return;
  }

  try {
    const match = await db.jobMatch.update({
      where: { id: matchId },
      data: {
        status: newStatus as any,
        ...(newStatus === "APPLIED" ? { appliedAt: new Date() } : {}),
        activityLog: {
          create: {
            type: "status_change",
            payload: {
              to: newStatus,
              changedAt: new Date().toISOString(),
              source: "telegram",
            },
          },
        },
      },
      select: { userId: true },
    });

    await publisher.publish(
      `sse:${match.userId}`,
      JSON.stringify({
        event: "match_status_updated",
        data: {
          matchId,
          status: newStatus,
          updatedAt: new Date().toISOString(),
        },
      })
    );

    const labels: Record<string, string> = {
      APPLIED: "✅ Marked as Applied",
      ARCHIVED: "📦 Archived",
      REJECTED: "❌ Rejected",
    };

    await ctx.answerCbQuery(labels[newStatus] ?? "Updated");
    await ctx.editMessageReplyMarkup(undefined);
  } catch (err: any) {
    console.error("[Telegram Bot] Callback error:", err.message);
    await ctx.answerCbQuery("Failed to update — try again");
  }
});

// ── Start command ─────────────────────────────────────────────────────────────
bot.start(async (ctx) => {
  const chatId = ctx.chat.id.toString();

  await ctx.reply(
    "👋 <b>Welcome to OpenJobPulse!</b>\n\n" +
      "I'll notify you when new job matches are found for your profile.\n\n" +
      `Your Chat ID is: <code>${chatId}</code>\n\n` +
      "Add this Chat ID in your OpenJobPulse settings to activate notifications.",
    { parse_mode: "HTML" }
  );
});

bot.help((ctx) => {
  ctx.reply(
    "📋 <b>Commands:</b>\n\n" +
      "/start — Get your Chat ID\n" +
      "/status — Check notification status\n\n" +
      "Use the inline buttons in match notifications to update your application status.",
    { parse_mode: "HTML" }
  );
});

export { bot };