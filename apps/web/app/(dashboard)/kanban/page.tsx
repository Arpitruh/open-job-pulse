import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@ojp/db";
import { redirect } from "next/navigation";
import Board from "@/components/kanban/Board";

export default async function KanbanPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const [matches, profile] = await Promise.all([
    db.jobMatch.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: "desc" },
      include: {
        jobListing: {
          select: {
            companyName: true,
            jobTitle: true,
            workMode: true,
            baseSalaryMin: true,
            baseSalaryMax: true,
            currency: true,
            applyUrl: true,
            sourcePortal: true,
            postedAt: true,
            descriptionRaw: true,
          },
        },
        activityLog: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        coverLetters: {
          select: { id: true, tone: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 3,
        },
      },
    }),
    db.userProfile.findUnique({
      where: { userId: session.user.id },
      select: { aiApiKey: true, creditBalance: true },
    }),
  ]);

  // Serialize for client component
  const serialized = matches.map((m) => ({
    ...m,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
    appliedAt: m.appliedAt?.toISOString() ?? null,
    activityLog: m.activityLog.map((a) => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
    })),
    coverLetters: m.coverLetters.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
    })),
    jobListing: {
      ...m.jobListing,
      postedAt: m.jobListing.postedAt?.toISOString() ?? null,
    },
  }));

  return (
    <div className="h-full flex flex-col">
      <Board
        initialMatches={serialized as any}
        hasAiKey={!!profile?.aiApiKey}
        creditBalance={profile?.creditBalance ?? 0}
      />
    </div>
  );
}