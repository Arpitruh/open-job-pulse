import cron from "node-cron";
import { ingestionQueue, aiQueue } from "@ojp/queue";
import { db } from "@ojp/db";

// ── Run all enabled scrapers on their schedule ────────────────────────────────
async function scheduleScrapers() {
  const scrapers = await db.scraperConfig.findMany({
    where: { enabled: true },
  });

  for (const scraper of scrapers) {
    const schedule = scraper.cronSchedule ?? "0 */4 * * *";

    if (!cron.validate(schedule)) {
      console.warn(`[Scheduler] Invalid cron: ${schedule} for ${scraper.label}`);
      continue;
    }

    cron.schedule(schedule, async () => {
      console.log(`[Scheduler] Queuing scraper: ${scraper.label}`);
      await ingestionQueue.add(
        "run-scraper",
        {
          scraperConfigId: scraper.id,
          workspaceId: scraper.workspaceId,
          adapterType: scraper.adapterType,
          sourceUrl: scraper.sourceUrl,
        },
        {
          jobId: `scheduled-${scraper.id}-${Date.now()}`,
          attempts: 3,
        }
      );
    });

    console.log(`[Scheduler] ${scraper.label} scheduled: ${schedule}`);
  }
}

// ── Weekly skills gap auto-refresh ───────────────────────────────────────────
// Every Monday at 8am UTC
cron.schedule("0 8 * * 1", async () => {
  console.log("[Scheduler] Running weekly skills gap refresh");

  const usersWithKey = await db.userProfile.findMany({
    where: {
      aiApiKey: { not: null },
      user: {
        subscription: { status: { in: ["ACTIVE", "TRIALING"] } },
      },
    },
    select: { userId: true, aiApiKey: true, creditBalance: true },
  });

  for (const profile of usersWithKey) {
    if ((profile.creditBalance ?? 0) < 10) continue;

    const existing = await db.skillsGapReport.findFirst({
      where: {
        userId: profile.userId,
        status: { in: ["QUEUED", "PROCESSING"] },
      },
    });
    if (existing) continue;

    const report = await db.skillsGapReport.create({
      data: {
        userId: profile.userId,
        status: "QUEUED",
        creditsCharged: 10,
        triggerType: "weekly_auto",
      },
    });

    await aiQueue.add(
      "skills-gap",
      {
        userId: profile.userId,
        reportId: report.id,
        encryptedApiKey: profile.aiApiKey!,
        aiProvider: "auto",
        triggerType: "weekly_auto",
      },
      { jobId: `weekly-skills-${profile.userId}-${Date.now()}`, attempts: 2 }
    );
  }

  console.log(
    `[Scheduler] Skills gap refresh queued for ${usersWithKey.length} users`
  );
});

// ── Data retention: purge listings older than 90 days ─────────────────────────
// Every day at 3am UTC
cron.schedule("0 3 * * *", async () => {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const deleted = await db.jobListing.deleteMany({
    where: {
      discoveredAt: { lt: ninetyDaysAgo },
      matches: { none: {} }, // Only delete listings with no matches
    },
  });

  console.log(`[Scheduler] Data retention: deleted ${deleted.count} old listings`);
});

// ── Reload scrapers every hour (picks up new ones added via UI) ───────────────
cron.schedule("0 * * * *", async () => {
  console.log("[Scheduler] Reloading scraper schedules");
  await scheduleScrapers();
});

// Start immediately
scheduleScrapers().catch(console.error);

console.log("⏰ Scheduler started");

export {};