import { db } from "@ojp/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  Users,
  DollarSign,
  Zap,
  Radio,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";

export default async function AdminOverviewPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "ADMIN") redirect("/dashboard");

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    activeSubscriptions,
    trialingUsers,
    pastDueUsers,
    cancelledUsers,
    totalListings,
    flaggedListings,
    failedScrapers,
    recentSignups,
    totalCreditsDeducted,
  ] = await Promise.all([
    db.user.count(),
    db.subscription.count({ where: { status: "ACTIVE" } }),
    db.subscription.count({ where: { status: "TRIALING" } }),
    db.subscription.count({ where: { status: "PAST_DUE" } }),
    db.subscription.count({ where: { status: "CANCELLED" } }),
    db.jobListing.count(),
    db.jobListing.count({ where: { isFlagged: true } }),
    db.scraperConfig.count({
      where: { consecutiveFails: { gte: 3 }, enabled: true },
    }),
    db.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    db.creditTransaction.aggregate({
      where: { type: "FEATURE_DEDUCT", createdAt: { gte: thirtyDaysAgo } },
      _sum: { amount: true },
    }),
  ]);

  // Calculate MRR from active subscriptions
  const activeSubs = await db.subscription.findMany({
    where: { status: "ACTIVE" },
    include: { plan: true },
  });

  const mrr = activeSubs.reduce((sum, sub) => {
    if (!sub.plan) return sum;
    if (sub.plan.interval === "WEEKLY") return sum + (sub.plan.amountCents * 4.33) / 100;
    if (sub.plan.interval === "MONTHLY") return sum + sub.plan.amountCents / 100;
    if (sub.plan.interval === "YEARLY") return sum + sub.plan.amountCents / 12 / 100;
    return sum;
  }, 0);

  const statCards = [
    {
      label: "Total Users",
      value: totalUsers,
      sub: `+${recentSignups} last 30 days`,
      icon: Users,
      color: "text-blue-600 bg-blue-50",
      href: "/admin/users",
    },
    {
      label: "MRR",
      value: `$${mrr.toFixed(0)}`,
      sub: `${activeSubscriptions} active plans`,
      icon: DollarSign,
      color: "text-green-600 bg-green-50",
      href: "/admin/revenue",
    },
    {
      label: "Trialing",
      value: trialingUsers,
      sub: `${pastDueUsers} past due`,
      icon: TrendingUp,
      color: "text-amber-600 bg-amber-50",
      href: "/admin/users",
    },
    {
      label: "Job Listings",
      value: totalListings.toLocaleString(),
      sub: `${flaggedListings} flagged`,
      icon: Radio,
      color: "text-indigo-600 bg-indigo-50",
      href: "/admin/listings",
    },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Overview</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Platform health at a glance
        </p>
      </div>

      {/* Alerts */}
      {(failedScrapers > 0 || pastDueUsers > 0 || flaggedListings > 0) && (
        <div className="space-y-2">
          {failedScrapers > 0 && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
              <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <p className="text-sm text-red-800">
                <span className="font-semibold">{failedScrapers} scrapers</span>{" "}
                have failed 3+ consecutive runs.{" "}
                <Link href="/admin/scrapers" className="underline font-medium">
                  Review →
                </Link>
              </p>
            </div>
          )}
          {pastDueUsers > 0 && (
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <p className="text-sm text-amber-800">
                <span className="font-semibold">{pastDueUsers} users</span>{" "}
                have payment failures.{" "}
                <Link href="/admin/users" className="underline font-medium">
                  Review →
                </Link>
              </p>
            </div>
          )}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="bg-white rounded-xl border border-gray-200 p-5 hover:border-purple-200 hover:shadow-sm transition-all group"
          >
            <div className={`p-2 rounded-lg w-fit ${card.color} mb-3`}>
              <card.icon className="w-4 h-4" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{card.value}</p>
            <p className="text-sm font-medium text-gray-600 mt-0.5">
              {card.label}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{card.sub}</p>
          </Link>
        ))}
      </div>

      {/* Subscription breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4 text-sm">
            Subscription Status
          </h2>
          <div className="space-y-3">
            {[
              { label: "Active", count: activeSubscriptions, color: "bg-green-500" },
              { label: "Trialing", count: trialingUsers, color: "bg-amber-400" },
              { label: "Past Due", count: pastDueUsers, color: "bg-red-500" },
              { label: "Cancelled", count: cancelledUsers, color: "bg-gray-300" },
            ].map((item) => {
              const total = totalUsers || 1;
              const pct = Math.round((item.count / total) * 100);
              return (
                <div key={item.label}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-600">{item.label}</span>
                    <span className="font-medium text-gray-900">
                      {item.count}
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full ${item.color}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4 text-sm">
            Quick Actions
          </h2>
          <div className="space-y-2">
            {[
              { label: "Review past due users", href: "/admin/users?status=PAST_DUE", icon: "⚠️" },
              { label: "Check failing scrapers", href: "/admin/scrapers", icon: "🔌" },
              { label: "Moderate flagged listings", href: "/admin/listings?flagged=true", icon: "🚩" },
              { label: "View credit usage", href: "/admin/credits", icon: "⚡" },
              { label: "Revenue analytics", href: "/admin/revenue", icon: "📈" },
            ].map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <span>{action.icon}</span>
                {action.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}