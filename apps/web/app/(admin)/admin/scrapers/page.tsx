import { db } from "@ojp/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import ScraperHealth from "@/components/admin/ScraperHealth";
import { Redis } from "ioredis";

export default async function AdminScrapersPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "ADMIN") redirect("/dashboard");

  // A Redis TTL heartbeat comes from the background process, not the web app.
  let workerHeartbeat: string | null = null;
  let redisConnected = false;
  const connection = process.env.REDIS_URL
    ? new Redis(process.env.REDIS_URL, { lazyConnect: true, connectTimeout: 3000, maxRetriesPerRequest: 1, retryStrategy: () => null })
    : null;
  if (connection) {
    try {
      await connection.connect();
      const response = await connection.ping();
      redisConnected = response === "PONG";
      workerHeartbeat = await connection.get("ojp:worker:heartbeat");
    } catch (error) {
      console.error("[Admin Scrapers] Worker health check failed:", error);
    } finally {
      connection.disconnect();
    }
  }

  const scrapers = await db.scraperConfig.findMany({
    orderBy: [{ consecutiveFails: "desc" }, { lastRunAt: "desc" }],
    include: {
      workspace: { select: { name: true, slug: true } },
    },
  });

  const serialized = scrapers.map((s) => ({
    id: s.id,
    label: s.label,
    adapterType: s.adapterType,
    sourceUrl: s.sourceUrl,
    cronSchedule: s.cronSchedule,
    enabled: s.enabled,
    lastRunAt: s.lastRunAt?.toISOString() ?? null,
    lastRunStatus: s.lastRunStatus,
    lastRunError: s.lastRunError,
    jobsIngested: s.jobsIngested,
    consecutiveFails: s.consecutiveFails,
    workspaceName: s.workspace.name,
    requestsPerMin: s.requestsPerMin,
  }));

  return <ScraperHealth scrapers={serialized} workerHeartbeat={workerHeartbeat} redisConnected={redisConnected} />;
}