import { Worker } from "bullmq";
import { redisConnection } from "@ojp/queue";
import { db } from "@ojp/db";
import {
  callAi,
  refundCredits,
  buildResumeOptimizerPrompt,
  buildSkillsGapPrompt,
} from "@ojp/ai";
import { Redis } from "ioredis";

const publisher = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

async function notifyUser(userId: string, event: string, data: object) {
  await publisher.publish(
    `sse:${userId}`,
    JSON.stringify({ event, data })
  );
}

// ── Resume Optimization Handler ───────────────────────────────────────────────
async function handleResumeOptimize(job: any) {
  const { userId, jobMatchId, runId, encryptedApiKey } = job.data;

  // Mark as processing
  await db.resumeOptimizationRun.update({
    where: { id: runId },
    data: { status: "PROCESSING" },
  });

  await notifyUser(userId, "optimization_started", { runId, jobMatchId });

  try {
    // Fetch data
    const [profile, match] = await Promise.all([
      db.userProfile.findUnique({
        where: { userId },
        select: { rawResumeText: true, parsedSkills: true },
      }),
      db.jobMatch.findUnique({
        where: { id: jobMatchId },
        include: {
          jobListing: {
            select: {
              companyName: true,
              jobTitle: true,
              descriptionRaw: true,
            },
          },
        },
      }),
    ]);

    if (!profile || !match) throw new Error("Profile or match not found");

    const resumeText =
      profile.rawResumeText ??
      `Skills: ${profile.parsedSkills.join(", ")}`;

    const { system, user } = buildResumeOptimizerPrompt({
      resumeText,
      jobTitle: match.jobListing.jobTitle,
      companyName: match.jobListing.companyName,
      jobDescription: match.jobListing.descriptionRaw,
    });

    // Call AI
    const response = await callAi(
      encryptedApiKey,
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { maxTokens: 2000 }
    );

    // Parse JSON response
    let report: any;
    try {
      // Strip markdown code blocks if present
      const cleaned = response.content
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      report = JSON.parse(cleaned);
    } catch {
      throw new Error("AI returned invalid JSON");
    }

    // Save completed run
    await db.resumeOptimizationRun.update({
      where: { id: runId },
      data: {
        status: "COMPLETED",
        overallScore: report.overallScore,
        atsScore: report.atsScore,
        report,
        aiModel: response.model,
        tokensUsed: response.tokensUsed,
        completedAt: new Date(),
      },
    });

    // Notify user via SSE + Telegram
    await notifyUser(userId, "optimization_completed", {
      runId,
      jobMatchId,
      overallScore: report.overallScore,
      atsScore: report.atsScore,
    });

    // Telegram notification
    await sendTelegramNotification(
      userId,
      `✅ Resume Score for ${match.jobListing.companyName}:\n\n` +
        `Overall: ${report.overallScore}/100\n` +
        `ATS: ${report.atsScore}/100\n\n` +
        `${report.sections?.keywords?.missing?.length ?? 0} missing keywords found`
    );

    console.log(`[AI Worker] Resume optimization complete: ${runId}`);
  } catch (err: any) {
    console.error(`[AI Worker] Resume optimization failed: ${err.message}`);

    await db.resumeOptimizationRun.update({
      where: { id: runId },
      data: {
        status: "FAILED",
        errorMessage: err.message,
        completedAt: new Date(),
      },
    });

    // Refund credits
    const run = await db.resumeOptimizationRun.findUnique({
      where: { id: runId },
      select: { creditsCharged: true },
    });
    if (run) {
      await refundCredits(
        userId,
        run.creditsCharged,
        "Resume optimization failed — refund"
      );
    }

    await notifyUser(userId, "optimization_failed", { runId, error: err.message });
    throw err;
  }
}

// ── Skills Gap Handler ────────────────────────────────────────────────────────
async function handleSkillsGap(job: any) {
  const { userId, reportId, encryptedApiKey } = job.data;

  await db.skillsGapReport.update({
    where: { id: reportId },
    data: { status: "PROCESSING" },
  });

  await notifyUser(userId, "skills_gap_started", { reportId });

  try {
    // Fetch profile + pipeline listings
    const [profile, matches] = await Promise.all([
      db.userProfile.findUnique({
        where: { userId },
        select: { parsedSkills: true, targetTitles: true },
      }),
      db.jobMatch.findMany({
        where: {
          userId,
          status: { in: ["DISCOVERED", "APPLIED", "INTERVIEWING"] },
        },
        include: {
          jobListing: {
            select: {
              jobTitle: true,
              companyName: true,
              descriptionRaw: true,
              baseSalaryMin: true,
              workMode: true,
            },
          },
        },
        take: 50, // cap at 50 for token limits
      }),
    ]);

    if (!profile) throw new Error("Profile not found");

    // Build aggregated job market summary
    const jobsSummary = matches
      .map(
        (m, i) =>
          `${i + 1}. ${m.jobListing.jobTitle} at ${m.jobListing.companyName}\n` +
          `   ${m.jobListing.descriptionRaw.slice(0, 300)}...`
      )
      .join("\n\n");

    const { system, user } = buildSkillsGapPrompt({
      resumeSkills: profile.parsedSkills,
      jobListingsSummary: jobsSummary,
      targetTitles: profile.targetTitles,
    });

    const response = await callAi(
      encryptedApiKey,
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { maxTokens: 3000 }
    );

    let report: any;
    try {
      const cleaned = response.content
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      report = JSON.parse(cleaned);
    } catch {
      throw new Error("AI returned invalid JSON");
    }

    await db.skillsGapReport.update({
      where: { id: reportId },
      data: {
        status: "COMPLETED",
        listingsAnalyzed: matches.length,
        report,
        aiModel: response.model,
        tokensUsed: response.tokensUsed,
        completedAt: new Date(),
      },
    });

    await notifyUser(userId, "skills_gap_completed", {
      reportId,
      criticalGaps: report.criticalGaps?.length ?? 0,
      strengths: report.yourStrengths?.length ?? 0,
    });

    await sendTelegramNotification(
      userId,
      `🧠 Skills Gap Analysis Complete!\n\n` +
        `Analyzed ${matches.length} job listings\n` +
        `💪 ${report.yourStrengths?.length ?? 0} strengths identified\n` +
        `⚠️ ${report.criticalGaps?.length ?? 0} critical gaps found\n\n` +
        `View your report → ${process.env.APP_URL}/skills-gap`
    );

    console.log(`[AI Worker] Skills gap complete: ${reportId}`);
  } catch (err: any) {
    console.error(`[AI Worker] Skills gap failed: ${err.message}`);

    await db.skillsGapReport.update({
      where: { id: reportId },
      data: {
        status: "FAILED",
        errorMessage: err.message,
        completedAt: new Date(),
      },
    });

    const report = await db.skillsGapReport.findUnique({
      where: { id: reportId },
      select: { creditsCharged: true },
    });
    if (report) {
      await refundCredits(
        userId,
        report.creditsCharged,
        "Skills gap analysis failed — refund"
      );
    }

    await notifyUser(userId, "skills_gap_failed", { reportId, error: err.message });
    throw err;
  }
}

// ── Telegram Helper ───────────────────────────────────────────────────────────
async function sendTelegramNotification(userId: string, message: string) {
  try {
    const profile = await db.userProfile.findUnique({
      where: { userId },
      select: { telegramChatId: true },
    });
    if (!profile?.telegramChatId || !process.env.TELEGRAM_BOT_TOKEN) return;

    await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: profile.telegramChatId,
          text: message,
          parse_mode: "HTML",
        }),
      }
    );
  } catch (err) {
    console.error("[AI Worker] Telegram notification failed:", err);
  }
}

// ── Worker ────────────────────────────────────────────────────────────────────
export const aiWorker = new Worker(
  "ai",
  async (job) => {
    console.log(`[AI Worker] Processing: ${job.name} (${job.id})`);

    switch (job.name) {
      case "resume-optimize":
        return handleResumeOptimize(job);
      case "skills-gap":
        return handleSkillsGap(job);
      default:
        console.warn(`[AI Worker] Unknown job: ${job.name}`);
    }
  },
  {
    connection: redisConnection,
    concurrency: 3,
    limiter: { max: 10, duration: 60_000 }, // 10 jobs/min
  }
);

aiWorker.on("completed", (job) => {
  console.log(`[AI Worker] ✓ ${job.name} completed (${job.id})`);
});

aiWorker.on("failed", (job, err) => {
  console.error(`[AI Worker] ✗ ${job?.name} failed:`, err.message);
});