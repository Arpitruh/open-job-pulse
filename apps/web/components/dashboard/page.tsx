import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@ojp/db";
import { redirect } from "next/navigation";
import {
  Briefcase,
  Send,
  Users,
  Trophy,
  Zap,
  ArrowRight,
  Clock,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;

  // Fetch all dashboard data in parallel
  const [stats, recentMatches, subscription, profile] = await Promise.all([
    // Application status counts
    db.jobMatch.groupBy({
      by: ["status"],
      where: { userId },
      _count: { status: true },
    }),
    // Recent 5 matches
    db.jobMatch.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        jobListing: {
          select: {
            companyName: true,
            jobTitle: true,
            workMode: true,
            baseSalaryMin: true,
            baseSalaryMax: true,
            currency: true,
            sourcePortal: true,
          },
        },
      },
    }),
    db.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    }),
    db.userProfile.findUnique({
      where: { userId },
      select: { creditBalance: true, parsedSkills: true, aiApiKey: true },
    }),
  ]);

  // Build stats map
  const statusMap = Object.fromEntries(
    stats.map((s) => [s.status, s._count.status])
  );

  const statCards = [
    {
      label: "Discovered",
      count: statusMap["DISCOVERED"] ?? 0,
      icon: Briefcase,
      color: "blue",
      href: "/kanban",
    },
    {
      label: "Applied",
      count: statusMap["APPLIED"] ?? 0,
      icon: Send,
      color: "indigo",
      href: "/kanban",
    },
    {
      label: "Interviewing",
      count: statusMap["INTERVIEWING"] ?? 0,
      icon: Users,
      color: "amber",
      href: "/kanban",
    },
    {
      label: "Offers",
      count: statusMap["OFFER_RECEIVED"] ?? 0,
      icon: Trophy,
      color: "green",
      href: "/kanban",
    },
  ];

  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600",
    indigo: "bg-indigo-50 text-indigo-600",
    amber: "bg-amber-50 text-amber-600",
    green: "bg-green-50 text-green-600",
  };

  const trialDaysLeft =
    subscription?.status === "TRIALING" && subscription.trialEnd
      ? Math.max(
          0,
          Math.ceil(
            (subscription.trialEnd.getTime() - Date.now()) /
              (1000 * 60 * 60 * 24)
          )
        )
      : null;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* ── Banners ────────────────────────────────────────────────────────── */}

      {/* Trial expiry banner */}
      {subscription?.status === "TRIALING" &&
        trialDaysLeft !== null &&
        trialDaysLeft <= 3 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <div>
                <p className="font-medium text-amber-900 text-sm">
                  Your trial ends in {trialDaysLeft} day
                  {trialDaysLeft !== 1 ? "s" : ""}
                </p>
                <p className="text-amber-700 text-xs mt-0.5">
                  Pick a plan to keep your matches, alerts, and AI tools.
                </p>
              </div>
            </div>
            <Link
              href="/settings/billing"
              className="flex-shrink-0 bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors"
            >
              Choose Plan
            </Link>
          </div>
        )}

      {/* Payment failed banner */}
      {subscription?.status === "PAST_DUE" && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <div>
              <p className="font-medium text-red-900 text-sm">
                Payment failed — update your payment method
              </p>
              <p className="text-red-700 text-xs mt-0.5">
                Access will be suspended in 3 days if not resolved.
              </p>
            </div>
          </div>
          <Link
            href="/settings/billing"
            className="flex-shrink-0 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
          >
            Fix Payment
          </Link>
        </div>
      )}

      {/* Low credits banner */}
      {(profile?.creditBalance ?? 0) < 10 && profile?.aiApiKey && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Zap className="w-5 h-5 text-blue-600 flex-shrink-0" />
            <p className="text-sm text-blue-800">
              <span className="font-medium">
                {profile.creditBalance} credits left.
              </span>{" "}
              Top up to keep using AI features.
            </p>
          </div>
          <Link
            href="/settings/billing"
            className="flex-shrink-0 text-blue-700 text-sm font-medium hover:underline"
          >
            Top Up →
          </Link>
        </div>
      )}

      {/* ── Stats Grid ─────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-bold text-gray-900 mb-4">
          Your Job Search
        </h1>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((card) => (
            <Link
              key={card.label}
              href={card.href}
              className="bg-white rounded-xl border border-gray-200 p-5 hover:border-blue-200 hover:shadow-sm transition-all group"
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`p-2 rounded-lg ${colorMap[card.color]}`}>
                  <card.icon className="w-4 h-4" />
                </div>
                <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-blue-400 transition-colors" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{card.count}</p>
              <p className="text-sm text-gray-500 mt-0.5">{card.label}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Main Content Grid ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Matches */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Recent Matches</h2>
            <Link
              href="/kanban"
              className="text-sm text-blue-600 hover:underline font-medium"
            >
              View all →
            </Link>
          </div>

          {recentMatches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-6">
              <Briefcase className="w-10 h-10 text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium text-sm">
                No matches yet
              </p>
              <p className="text-gray-400 text-xs mt-1">
                Configure your scrapers to start discovering jobs
              </p>
              <Link
                href="/settings/scrapers"
                className="mt-4 text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Set Up Scrapers
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {recentMatches.map((match) => (
                <div
                  key={match.id}
                  className="px-5 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {match.jobListing.jobTitle}
                        </p>
                        <Badge
                          variant={
                            match.status === "APPLIED"
                              ? "success"
                              : match.status === "INTERVIEWING"
                              ? "warning"
                              : match.status === "OFFER_RECEIVED"
                              ? "success"
                              : "secondary"
                          }
                        >
                          {match.status.charAt(0) +
                            match.status.slice(1).toLowerCase().replace("_", " ")}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {match.jobListing.companyName}
                        {match.jobListing.baseSalaryMin && (
                          <span className="text-gray-400 ml-2">
                            ·{" "}
                            {match.jobListing.currency ?? "$"}
                            {Math.round(
                              match.jobListing.baseSalaryMin / 1000
                            )}
                            k
                            {match.jobListing.baseSalaryMax && (
                              <>
                                –
                                {Math.round(
                                  match.jobListing.baseSalaryMax / 1000
                                )}
                                k
                              </>
                            )}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <div
                        className={`text-xs font-bold px-2 py-1 rounded-full ${
                          match.similarityScore >= 0.85
                            ? "bg-green-100 text-green-700"
                            : match.similarityScore >= 0.65
                            ? "bg-blue-100 text-blue-700"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {Math.round(match.similarityScore * 100)}% match
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {formatDistanceToNow(match.createdAt, {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions + AI Setup */}
        <div className="space-y-4">
          {/* AI Setup prompt if no key */}
          {!profile?.aiApiKey && (
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl p-5 text-white">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4" />
                <span className="text-sm font-semibold">Unlock AI Features</span>
              </div>
              <p className="text-blue-100 text-xs leading-relaxed mb-4">
                Connect your OpenAI or Anthropic key to generate cover letters,
                optimize your resume, and analyze skills gaps.
              </p>
              <Link
                href="/settings/ai-keys"
                className="block text-center bg-white text-blue-700 rounded-lg py-2 text-sm font-semibold hover:bg-blue-50 transition-colors"
              >
                Connect API Key
              </Link>
            </div>
          )}

          {/* Quick actions */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900 text-sm">
                Quick Actions
              </h2>
            </div>
            <div className="p-3 space-y-1">
              {[
                {
                  label: "View Kanban Board",
                  href: "/kanban",
                  icon: "🗂️",
                },
                {
                  label: "Analyze Skills Gap",
                  href: "/skills-gap",
                  icon: "🧠",
                },
                {
                  label: "Add Job Source",
                  href: "/settings/scrapers",
                  icon: "🔌",
                },
                {
                  label: "Set Up Alerts",
                  href: "/settings/notifications",
                  icon: "🔔",
                },
                {
                  label: "Manage Billing",
                  href: "/settings/billing",
                  icon: "💳",
                },
              ].map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <span>{action.icon}</span>
                  {action.label}
                  <ArrowRight className="w-3.5 h-3.5 text-gray-400 ml-auto" />
                </Link>
              ))}
            </div>
          </div>

          {/* Credit balance card */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900 text-sm">
                AI Credits
              </h2>
              <Link
                href="/settings/billing"
                className="text-xs text-blue-600 hover:underline"
              >
                Top up
              </Link>
            </div>
            <div className="flex items-baseline gap-1 mb-2">
              <span className="text-3xl font-bold text-gray-900">
                {profile?.creditBalance ?? 0}
              </span>
              <span className="text-sm text-gray-500">credits</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full transition-all ${
                  (profile?.creditBalance ?? 0) > 20
                    ? "bg-blue-500"
                    : "bg-amber-500"
                }`}
                style={{
                  width: `${Math.min(
                    100,
                    ((profile?.creditBalance ?? 0) / 150) * 100
                  )}%`,
                }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-1.5">
              <span>Cover letter: 10cr</span>
              <span>Resume: 15cr</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}