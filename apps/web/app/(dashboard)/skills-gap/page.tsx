import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@ojp/db";
import { redirect } from "next/navigation";
import SkillsGapClient from "@/components/ai/SkillsGapReport";

export default async function SkillsGapPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;

  const [profile, latestReport, inProgress, matchCount] = await Promise.all([
    db.userProfile.findUnique({
      where: { userId },
      select: { aiApiKey: true, creditBalance: true, parsedSkills: true },
    }),
    db.skillsGapReport.findFirst({
      where: { userId, status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
    }),
    db.skillsGapReport.findFirst({
      where: { userId, status: { in: ["QUEUED", "PROCESSING"] } },
    }),
    db.jobMatch.count({
      where: {
        userId,
        status: { in: ["DISCOVERED", "APPLIED", "INTERVIEWING"] },
      },
    }),
  ]);

  return (
    <SkillsGapClient
      hasAiKey={!!profile?.aiApiKey}
      creditBalance={profile?.creditBalance ?? 0}
      latestReport={latestReport
        ? {
            ...latestReport,
            createdAt: latestReport.createdAt.toISOString(),
            completedAt: latestReport.completedAt?.toISOString() ?? null,
          }
        : null}
      inProgress={!!inProgress}
      matchCount={matchCount}
      parsedSkills={profile?.parsedSkills ?? []}
    />
  );
}