import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@ojp/db";
import { redirect } from "next/navigation";
import ScraperSettings from "@/components/settings/ScraperSettings";

export default async function ScrapersPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const workspace = await db.workspaceMember.findFirst({
    where: { userId: session.user.id },
    select: { workspaceId: true },
  });

  const scrapers = workspace
    ? await db.scraperConfig.findMany({
        where: { workspaceId: workspace.workspaceId },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const serialized = scrapers.map((s) => ({
    id: s.id,
    label: s.label,
    adapterType: s.adapterType,
    sourceUrl: s.sourceUrl,
    cronSchedule: s.cronSchedule,
    enabled: s.enabled,
    lastRunAt: s.lastRunAt?.toISOString() ?? null,
    lastRunStatus: s.lastRunStatus,
    jobsIngested: s.jobsIngested,
    consecutiveFails: s.consecutiveFails,
  }));

  return (
    <ScraperSettings
      scrapers={serialized}
      workspaceId={workspace?.workspaceId ?? null}
    />
  );
}