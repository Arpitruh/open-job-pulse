import { Worker, type Job } from "bullmq";
import { redisConnection } from "@ojp/queue";
import { db } from "@ojp/db";
import { sendMatchNotification, bot } from "../telegram/bot";
import { Resend } from "resend";
import type {
  SendTelegramJob,
  SendEmailDigestJob,
  SendWebhookJob,
} from "@ojp/queue";
import axios from "axios";

const resend = new Resend(process.env.RESEND_API_KEY);

export const dispatchWorker = new Worker(
  "dispatch",
  async (job: Job) => {
    switch (job.name) {
      case "send-telegram":
        return handleTelegram(job.data as SendTelegramJob);
      case "send-email-digest":
        return handleEmailDigest(job.data as SendEmailDigestJob);
      case "send-webhook":
        return handleWebhook(job.data as SendWebhookJob);
      default:
        console.warn(`[Dispatch] Unknown job: ${job.name}`);
    }
  },
  {
    connection: redisConnection,
    concurrency: 10,
    limiter: { max: 50, duration: 60_000 },
  }
);

// ── Telegram dispatch ─────────────────────────────────────────────────────────
async function handleTelegram(data: SendTelegramJob) {
  const match = await db.jobMatch.findUnique({
    where: { id: data.jobMatchId },
    include: {
      jobListing: {
        select: {
          jobTitle: true,
          companyName: true,
          workMode: true,
          baseSalaryMin: true,
          baseSalaryMax: true,
          currency: true,
          applyUrl: true,
          sourcePortal: true,
        },
      },
    },
  });

  if (!match) return;

  const delivered = await sendMatchNotification(data.chatId, match);

  await db.notificationLog.create({
    data: {
      userId: data.userId,
      channel: "telegram",
      destination: data.chatId,
      payloadSnapshot: { matchId: data.jobMatchId },
      delivered,
    },
  });
}

// ── Email digest ──────────────────────────────────────────────────────────────
async function handleEmailDigest(data: SendEmailDigestJob) {
  const user = await db.user.findUnique({
    where: { id: data.userId },
    select: { email: true },
  });

  if (!user) return;

  // Get recent unnotified matches
  const since =
    data.digestType === "daily"
      ? new Date(Date.now() - 24 * 60 * 60 * 1000)
      : data.digestType === "weekly"
      ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      : new Date(Date.now() - 60 * 60 * 1000);

  const matches = await db.jobMatch.findMany({
    where: {
      userId: data.userId,
      status: "DISCOVERED",
      createdAt: { gte: since },
    },
    include: {
      jobListing: {
        select: {
          jobTitle: true,
          companyName: true,
          workMode: true,
          baseSalaryMin: true,
          applyUrl: true,
        },
      },
    },
    take: 10,
    orderBy: { similarityScore: "desc" },
  });

  if (matches.length === 0) return;

  const matchRows = matches
    .map(
      (m) =>
        `<tr>
          <td style="padding:8px;border-bottom:1px solid #f0f0f0;">
            <strong>${m.jobListing.jobTitle}</strong><br>
            <span style="color:#6b7280;font-size:12px;">${m.jobListing.companyName}</span>
          </td>
          <td style="padding:8px;border-bottom:1px solid #f0f0f0;text-align:center;">
            ${Math.round(m.similarityScore * 100)}%
          </td>
          <td style="padding:8px;border-bottom:1px solid #f0f0f0;">
            <a href="${m.jobListing.applyUrl}" style="color:#3b82f6;">View →</a>
          </td>
        </tr>`
    )
    .join("");

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px;">
      <h2 style="color:#1d4ed8;">
        ${matches.length} New Job Match${matches.length > 1 ? "es" : ""}
      </h2>
      <p style="color:#6b7280;">
        ${
          data.digestType === "instant"
            ? "A new match was just found"
            : `Your ${data.digestType} digest`
        }
      </p>
      <table style="width:100%;border-collapse:collapse;margin-top:16px;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:8px;text-align:left;">Role</th>
            <th style="padding:8px;">Match</th>
            <th style="padding:8px;">Link</th>
          </tr>
        </thead>
        <tbody>${matchRows}</tbody>
      </table>
      <a href="${process.env.APP_URL}/kanban"
         style="display:inline-block;margin-top:24px;background:#3b82f6;color:#fff;
                padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">
        Open Job Board →
      </a>
    </div>
  `;

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: user.email,
    subject: `${matches.length} new job match${matches.length > 1 ? "es" : ""} on OpenJobPulse`,
    html,
  });

  await db.notificationLog.create({
    data: {
      userId: data.userId,
      channel: "email",
      destination: user.email,
      payloadSnapshot: { matchCount: matches.length, digestType: data.digestType },
      delivered: true,
    },
  });
}

// ── Webhook dispatch ──────────────────────────────────────────────────────────
async function handleWebhook(data: SendWebhookJob) {
  const match = await db.jobMatch.findUnique({
    where: { id: data.jobMatchId },
    include: {
      jobListing: true,
    },
  });

  if (!match) return;

  const payload = {
    event: "job.matched",
    matchId: match.id,
    score: Math.round(match.similarityScore * 100),
    job: {
      title: match.jobListing.jobTitle,
      company: match.jobListing.companyName,
      workMode: match.jobListing.workMode,
      applyUrl: match.jobListing.applyUrl,
      salary: match.jobListing.baseSalaryMin
        ? {
            min: match.jobListing.baseSalaryMin,
            max: match.jobListing.baseSalaryMax,
            currency: match.jobListing.currency,
          }
        : null,
    },
    matchedAt: match.createdAt,
  };

  let delivered = false;
  try {
    await axios.post(data.webhookUrl, payload, {
      timeout: 10_000,
      headers: { "Content-Type": "application/json" },
    });
    delivered = true;
  } catch (err: any) {
    console.error("[Dispatch] Webhook failed:", err.message);
  }

  await db.notificationLog.create({
    data: {
      userId: data.userId,
      channel: "webhook",
      destination: data.webhookUrl,
      payloadSnapshot: payload as any,
      delivered,
    },
  });
}

dispatchWorker.on("completed", (job) => {
  console.log(`[Dispatch Worker] ✓ ${job.name} (${job.id})`);
});

dispatchWorker.on("failed", (job, err) => {
  console.error(`[Dispatch Worker] ✗ ${job?.name}:`, err.message);
});