import { Worker, type Job } from "bullmq";
import { redisConnection } from "@ojp/queue";
import { db } from "@ojp/db";
import { sendMatchNotification, bot } from "../telegram/bot";
import { sendTemplatedNotification } from "../notifications/client";
import type {
  SendTelegramJob,
  SendEmailDigestJob,
  SendWebhookJob,
} from "@ojp/queue";
import axios from "axios";


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

  // Notification Service owns templates and delivery. We only submit safe,
  // structured text so a job description cannot inject markup into an email.
  const jobLines = matches.map((m, i) => {
    const title = m.jobListing.jobTitle.replace(/[\r\n]+/g, " ").slice(0, 160);
    const company = m.jobListing.companyName.replace(/[\r\n]+/g, " ").slice(0, 160);
    const url = m.jobListing.applyUrl;
    return `${i + 1}. ${title} at ${company} (${Math.round(m.similarityScore * 100)}% match) — ${url}`;
  });
  const notification = await sendTemplatedNotification({
    recipient: user.email,
    templateId: process.env.NOTIFICATION_SERVICE_JOB_DIGEST_TEMPLATE ?? "openjobpulse-job-digest",
    payloadData: {
      name: user.email.split("@")[0],
      matchCount: matches.length,
      digestType: data.digestType,
      jobs: jobLines.join("\n"),
      dashboardUrl: `${(process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "")}/kanban`,
    },
    idempotencyKey: `openjobpulse:digest:${data.userId}:${data.digestType}:${matches.map((m) => m.id).sort().join(",")}`,
  });

  // 202/queued means accepted for asynchronous processing, NOT delivered.
  await db.notificationLog.create({
    data: {
      userId: data.userId,
      channel: "email",
      destination: user.email,
      payloadSnapshot: {
        matchCount: matches.length,
        digestType: data.digestType,
        provider: "notification-service",
        notificationId: notification.notificationId,
        acceptedStatus: notification.status,
      },
      delivered: false,
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