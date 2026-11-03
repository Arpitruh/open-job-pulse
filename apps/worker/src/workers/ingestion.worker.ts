import { Worker, type Job } from "bullmq";
import { redisConnection, matchingQueue } from "@ojp/queue";
import { db } from "@ojp/db";
import { GreenhouseScraper } from "../scrapers/greenhouse.scraper";
import { LeverScraper } from "../scrapers/lever.scraper";
import { RssScraper } from "../scrapers/rss.scraper";
import { RobotsDisallowedError } from "../scrapers/robots.checker";
import type { RunScraperJob } from "@ojp/queue";

function buildScraper(config: any) {
  const scraperConfig = {
    id: config.scraperConfigId,
    label: config.label ?? config.adapterType,
    sourceUrl: config.sourceUrl,
    workspaceId: config.workspaceId,
    requestsPerMin: config.requestsPerMin ?? 10,
    delayMs: config.delayMs ?? 1000,
    maxRetries: config.maxRetries ?? 3,
  };

  switch (config.adapterType) {
    case "GREENHOUSE":
      return new GreenhouseScraper(scraperConfig);
    case "LEVER":
      return new LeverScraper(scraperConfig);
    case "RSS_ATOM":
      return new RssScraper(scraperConfig);
    default:
      throw new Error(`Unknown adapter type: ${config.adapterType}`);
  }
}

export const ingestionWorker = new Worker(
  "ingestion",
  async (job: Job<RunScraperJob>) => {
    const { scraperConfigId, workspaceId, adapterType, sourceUrl } = job.data;

    // Fetch full config from DB
    const scraperConfig = await db.scraperConfig.findUnique({
      where: { id: scraperConfigId },
    });

    if (!scraperConfig || !scraperConfig.enabled) {
      console.log(`[Ingestion] Scraper ${scraperConfigId} not found or disabled`);
      return;
    }

    // Mark as running
    await db.scraperConfig.update({
      where: { id: scraperConfigId },
      data: { lastRunAt: new Date(), lastRunStatus: "running" },
    });

    try {
      const scraper = buildScraper({
        scraperConfigId,
        adapterType,
        sourceUrl,
        workspaceId,
        requestsPerMin: scraperConfig.requestsPerMin,
        delayMs: scraperConfig.delayMs,
        maxRetries: scraperConfig.maxRetries,
      });

      const { ingested, skipped, errors } = await scraper.run();

      // Mark success
      await db.scraperConfig.update({
        where: { id: scraperConfigId },
        data: {
          lastRunStatus: "success",
          jobsIngested: { increment: ingested },
          consecutiveFails: 0,
          lastRunError: null,
        },
      });

      // Enqueue matching jobs for new listings
      const newListings = await db.jobListing.findMany({
        where: { discoveredAt: { gte: new Date(Date.now() - 5 * 60 * 1000) } },
        select: { id: true },
        take: ingested,
      });

      for (const listing of newListings) {
        await matchingQueue.add(
          "match-jobs",
          { jobListingId: listing.id },
          { jobId: `match-${listing.id}`, attempts: 3 }
        );
      }

      console.log(
        `[Ingestion] ${scraperConfig.label}: +${ingested} listings, ${skipped} dupes, ${errors} errors`
      );
    } catch (err: any) {
      const isBotBlocked = err instanceof RobotsDisallowedError;

      await db.scraperConfig.update({
        where: { id: scraperConfigId },
        data: {
          lastRunStatus: "failed",
          lastRunError: err.message,
          consecutiveFails: { increment: 1 },
        },
      });

      // Alert admin if 3 consecutive fails
      const updated = await db.scraperConfig.findUnique({
        where: { id: scraperConfigId },
        select: { consecutiveFails: true, label: true },
      });

      if (updated && updated.consecutiveFails >= 3) {
        console.error(
          `[Ingestion] ALERT: ${updated.label} has failed ${updated.consecutiveFails} times`
        );
        // Admin email notification would go here
      }

      if (!isBotBlocked) throw err; // Re-throw for BullMQ retry
    }
  },
  {
    connection: redisConnection,
    concurrency: 5,
    limiter: { max: 20, duration: 60_000 },
  }
);

ingestionWorker.on("completed", (job) => {
  console.log(`[Ingestion Worker] ✓ ${job.id}`);
});

ingestionWorker.on("failed", (job, err) => {
  console.error(`[Ingestion Worker] ✗ ${job?.id}:`, err.message);
});