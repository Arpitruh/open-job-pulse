import { db } from "@ojp/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import RevenueChart from "@/components/admin/RevenueChart";
import { subDays, format, startOfDay } from "date-fns";

export default async function AdminRevenuePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "ADMIN") redirect("/dashboard");

  // MRR from active subscriptions
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

  // Plan distribution
  const planGroups = await db.subscription.groupBy({
    by: ["status"],
    _count: { status: true },
  });

  // Signups last 30 days (daily)
  const thirtyDaysAgo = subDays(new Date(), 30);
  const recentUsers = await db.user.findMany({
    where: { createdAt: { gte: thirtyDaysAgo } },
    select: { createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  // Build daily signup chart data
  const signupsByDay: Record<string, number> = {};
  for (let i = 29; i >= 0; i--) {
    const day = format(subDays(new Date(), i), "MMM d");
    signupsByDay[day] = 0;
  }
  recentUsers.forEach((u) => {
    const day = format(startOfDay(u.createdAt), "MMM d");
    if (signupsByDay[day] !== undefined) {
      signupsByDay[day]++;
    }
  });

  const signupChartData = Object.entries(signupsByDay).map(([date, count]) => ({
    date,
    count,
  }));

  // Plan distribution data
  const planDistribution = await db.subscription.groupBy({
    by: ["planId"],
    where: { status: "ACTIVE" },
    _count: { planId: true },
  });

  const plans = await db.plan.findMany();
  const planDistData = planDistribution.map((p) => ({
    name: plans.find((pl) => pl.id === p.planId)?.name ?? "Unknown",
    count: p._count.planId,
  }));

  // Credit revenue (top-up transactions last 30 days)
  const creditRevenue = await db.creditTransaction.aggregate({
    where: {
      type: "TOPUP_PURCHASE",
      createdAt: { gte: thirtyDaysAgo },
    },
    _sum: { amount: true },
    _count: { id: true },
  });

  // Churn: cancelled in last 30 days
  const churnedThisMonth = await db.subscription.count({
    where: {
      status: "CANCELLED",
      updatedAt: { gte: thirtyDaysAgo },
    },
  });

  const activeStart = await db.subscription.count({
    where: { status: { in: ["ACTIVE", "TRIALING"] } },
  });

  const churnRate =
    activeStart > 0 ? ((churnedThisMonth / activeStart) * 100).toFixed(1) : "0";

  return (
    <RevenueChart
      mrr={mrr}
      signupChartData={signupChartData}
      planDistData={planDistData}
      creditRevenue={{
        total: Math.abs(creditRevenue._sum.amount ?? 0),
        transactions: creditRevenue._count.id,
      }}
      churnRate={parseFloat(churnRate)}
      churnedThisMonth={churnedThisMonth}
      statusBreakdown={planGroups.map((g) => ({
        status: g.status,
        count: g._count.status,
      }))}
    />
  );
}