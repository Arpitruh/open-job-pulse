import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@ojp/db";
import { redirect } from "next/navigation";
import { Briefcase, Send, Users, Trophy, Zap, ArrowRight, Clock, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [stats, recentMatches, subscription, profile] = await Promise.all([
    db.jobMatch.groupBy({ by: ["status"], where: { userId }, _count: { status: true } }),
    db.jobMatch.findMany({
      where: { userId }, orderBy: { createdAt: "desc" }, take: 5,
      include: { jobListing: { select: { companyName: true, jobTitle: true, workMode: true, baseSalaryMin: true, baseSalaryMax: true, currency: true, sourcePortal: true } } },
    }),
    db.subscription.findUnique({ where: { userId }, include: { plan: true } }),
    db.userProfile.findUnique({ where: { userId }, select: { creditBalance: true, parsedSkills: true, aiApiKey: true } }),
  ]);

  const statusMap = Object.fromEntries(stats.map((s) => [s.status, s._count.status]));
  const statCards = [
    { label: "Discovered", count: statusMap["DISCOVERED"] ?? 0, icon: Briefcase, color: "bg-blue-50 text-blue-600", href: "/kanban" },
    { label: "Applied", count: statusMap["APPLIED"] ?? 0, icon: Send, color: "bg-indigo-50 text-indigo-600", href: "/kanban" },
    { label: "Interviewing", count: statusMap["INTERVIEWING"] ?? 0, icon: Users, color: "bg-amber-50 text-amber-600", href: "/kanban" },
    { label: "Offers", count: statusMap["OFFER_RECEIVED"] ?? 0, icon: Trophy, color: "bg-green-50 text-green-600", href: "/kanban" },
  ];

  const trialDaysLeft = subscription?.status === "TRIALING" && subscription.trialEnd
    ? Math.max(0, Math.ceil((subscription.trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {subscription?.status === "TRIALING" && trialDaysLeft !== null && trialDaysLeft <= 3 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <p className="font-medium text-amber-900 text-sm">Trial ends in {trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""}</p>
          </div>
          <Link href="/settings/billing" className="bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-700">Choose Plan</Link>
        </div>
      )}

      {subscription?.status === "PAST_DUE" && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <p className="font-medium text-red-900 text-sm">Payment failed — update your payment method</p>
          </div>
          <Link href="/settings/billing" className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700">Fix Payment</Link>
        </div>
      )}

      <div>
        <h1 className="text-xl font-bold text-gray-900 mb-4">Your Job Search</h1>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((card) => (
            <Link key={card.label} href={card.href} className="bg-white rounded-xl border border-gray-200 p-5 hover:border-blue-200 hover:shadow-sm transition-all group">
              <div className="flex items-center justify-between mb-3">
                <div className={`p-2 rounded-lg ${card.color}`}><card.icon className="w-4 h-4" /></div>
                <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-blue-400 transition-colors" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{card.count}</p>
              <p className="text-sm text-gray-500 mt-0.5">{card.label}</p>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Recent Matches</h2>
            <Link href="/kanban" className="text-sm text-blue-600 hover:underline font-medium">View all →</Link>
          </div>
          {recentMatches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-6">
              <Briefcase className="w-10 h-10 text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium text-sm">No matches yet</p>
              <p className="text-gray-400 text-xs mt-1">Configure your scrapers to start discovering jobs</p>
              <Link href="/settings/scrapers" className="mt-4 text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">Set Up Scrapers</Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {recentMatches.map((match) => (
                <div key={match.id} className="px-5 py-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{match.jobListing.jobTitle}</p>
                      <p className="text-sm text-gray-500 mt-0.5">{match.jobListing.companyName}</p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <div className="text-xs font-bold px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                        {Math.round(match.similarityScore * 100)}% match
                      </div>
                      <p className="text-xs text-gray-400 mt-1">{formatDistanceToNow(match.createdAt, { addSuffix: true })}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          {!profile?.aiApiKey && (
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl p-5 text-white">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4" />
                <span className="text-sm font-semibold">Unlock AI Features</span>
              </div>
              <p className="text-blue-100 text-xs leading-relaxed mb-4">Connect your OpenAI or Anthropic key to generate cover letters and analyze skill gaps.</p>
              <Link href="/settings/ai-keys" className="block text-center bg-white text-blue-700 rounded-lg py-2 text-sm font-semibold hover:bg-blue-50">Connect API Key</Link>
            </div>
          )}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900 text-sm">AI Credits</h2>
              <Link href="/settings/billing" className="text-xs text-blue-600 hover:underline">Top up</Link>
            </div>
            <div className="flex items-baseline gap-1 mb-2">
              <span className="text-3xl font-bold text-gray-900">{profile?.creditBalance ?? 0}</span>
              <span className="text-sm text-gray-500">credits</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5">
              <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${Math.min(100, ((profile?.creditBalance ?? 0) / 150) * 100)}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}