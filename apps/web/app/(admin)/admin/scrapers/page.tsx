import { db } from "@ojp/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import ScraperHealth from "@/components/admin/ScraperHealth";

export default async function AdminScrapersPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "ADMIN") redirect("/dashboard");

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

  return <ScraperHealth scrapers={serialized} />;
}