import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { db } from "@ojp/db";

const stages = [
  { key: "DISCOVERED", label: "Discovered" },
  { key: "APPLIED", label: "Applied" },
  { key: "INTERVIEWING", label: "Interviewing" },
  { key: "OFFER_RECEIVED", label: "Offer received" },
  { key: "REJECTED", label: "Rejected" },
  { key: "ARCHIVED", label: "Archived" },
] as const;

function percent(part: number, total: number) {
  return total ? Math.round((part / total) * 100) : 0;
}

export default async function AnalyticsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  // Every query is scoped to the current session. Never expose global job data.
  const userId = session.user.id;
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [grouped, total, recentCount, score, recent] = await Promise.all([
    db.jobMatch.groupBy({
      by: ["status"],
      where: { userId },
      _count: { _all: true },
    }),
    db.jobMatch.count({ where: { userId } }),
    db.jobMatch.count({ where: { userId, createdAt: { gte: since } } }),
    db.jobMatch.aggregate({ where: { userId }, _avg: { similarityScore: true } }),
    db.jobMatch.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: {
        id: true,
        status: true,
        similarityScore: true,
        jobListing: { select: { jobTitle: true, companyName: true } },
      },
    }),
  ]);

  const counts = new Map(grouped.map((item) => [item.status, item._count._all]));
  const progressed = (counts.get("APPLIED") ?? 0) +
    (counts.get("INTERVIEWING") ?? 0) + (counts.get("OFFER_RECEIVED") ?? 0);
  const avgScore = score._avg.similarityScore;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Application analytics</h1>
        <p className="mt-1 text-sm text-gray-500">
          Your current job pipeline, based on saved matches. All figures are private to your account.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Total matches", value: total.toLocaleString() },
          { label: "Discovered in 30 days", value: recentCount.toLocaleString() },
          { label: "Active applications", value: progressed.toLocaleString() },
          { label: "Average match score", value: avgScore === null ? "—" : `${Math.round(avgScore * 100)}%` },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-500">{stat.label}</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">{stat.value}</p>
          </div>
        ))}
      </div>

      {total === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
          <h2 className="font-semibold text-gray-900">No job matches to analyze yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
            Configure a job source and run matching to see your application pipeline here.
          </p>
          <Link href="/settings/scrapers" className="mt-4 inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Configure job sources
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          <section className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-3">
            <h2 className="font-semibold text-gray-900">Current stage distribution</h2>
            <p className="mb-6 mt-1 text-xs text-gray-500">
              Each match is counted in its current stage, not every stage it previously visited.
            </p>
            <div className="space-y-5">
              {stages.map(({ key, label }) => {
                const count = counts.get(key) ?? 0;
                return (
                  <div key={key}>
                    <div className="mb-2 flex justify-between text-sm">
                      <span className="font-medium text-gray-700">{label}</span>
                      <span className="tabular-nums text-gray-500">{count} · {percent(count, total)}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-100" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={count}>
                      <div className="h-full rounded-full bg-blue-600" style={{ width: `${percent(count, total)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold text-gray-900">Recently updated matches</h2>
              <Link href="/kanban" className="text-sm font-medium text-blue-600 hover:underline">View board</Link>
            </div>
            <div className="mt-4 divide-y divide-gray-100">
              {recent.map((match) => (
                <div key={match.id} className="py-3 first:pt-0">
                  <p className="truncate text-sm font-semibold text-gray-900">{match.jobListing.jobTitle}</p>
                  <p className="truncate text-xs text-gray-500">{match.jobListing.companyName}</p>
                  <div className="mt-1 flex justify-between text-xs text-gray-500">
                    <span>{stages.find((stage) => stage.key === match.status)?.label ?? match.status}</span>
                    <span className="tabular-nums">{Math.round(match.similarityScore * 100)}% match</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
