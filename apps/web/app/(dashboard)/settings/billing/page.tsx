import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@ojp/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Zap, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

export default async function BillingPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const [subscription, profile, plans, packs] = await Promise.all([
    db.subscription.findUnique({
      where: { userId: session.user.id },
      include: { plan: true },
    }),
    db.userProfile.findUnique({
      where: { userId: session.user.id },
      select: { creditBalance: true, creditsLifetime: true },
    }),
    db.plan.findMany({ where: { isActive: true }, orderBy: { amountCents: "asc" } }),
    db.creditPack.findMany({ where: { isActive: true }, orderBy: { amountCents: "asc" } }),
  ]);

  const trialDaysLeft =
    subscription?.status === "TRIALING" && subscription.trialEnd
      ? Math.max(0, Math.ceil((subscription.trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : null;

  const intervalLabel: Record<string, string> = {
    WEEKLY: "/ week", MONTHLY: "/ month", YEARLY: "/ year",
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Billing</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your subscription and credits</p>
      </div>

      {/* Current subscription status */}
      <div className={`rounded-xl border p-5 ${
        subscription?.status === "ACTIVE" ? "bg-green-50 border-green-200" :
        subscription?.status === "TRIALING" ? "bg-blue-50 border-blue-200" :
        subscription?.status === "PAST_DUE" ? "bg-red-50 border-red-200" :
        "bg-gray-50 border-gray-200"
      }`}>
        <div className="flex items-center gap-3">
          {subscription?.status === "ACTIVE" && <CheckCircle2 className="w-5 h-5 text-green-600" />}
          {subscription?.status === "TRIALING" && <Zap className="w-5 h-5 text-blue-600" />}
          {subscription?.status === "PAST_DUE" && <AlertTriangle className="w-5 h-5 text-red-600" />}
          {(!subscription || subscription.status === "CANCELLED") && <XCircle className="w-5 h-5 text-gray-400" />}
          <div>
            <p className="font-semibold text-gray-900 text-sm">
              {subscription?.status === "TRIALING" && `Free Trial — ${trialDaysLeft} day${trialDaysLeft !== 1 ? "s" : ""} left`}
              {subscription?.status === "ACTIVE" && `Active — ${subscription.plan?.name ?? "Unknown"} Plan`}
              {subscription?.status === "PAST_DUE" && "Payment Failed"}
              {subscription?.status === "CANCELLED" && "Subscription Cancelled"}
              {!subscription && "No Subscription"}
            </p>
            {subscription?.currentPeriodEnd && subscription.status === "ACTIVE" && (
              <p className="text-xs text-gray-500 mt-0.5">
                Renews {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
        {subscription?.stripeCustomerId && (
          <form action="/api/billing/portal" method="POST" className="mt-4">
            <button type="submit" className="text-sm text-blue-600 font-medium hover:underline">
              Manage subscription in Stripe →
            </button>
          </form>
        )}
      </div>

      {/* Plans */}
      {(subscription?.status === "TRIALING" || subscription?.status === "CANCELLED" || !subscription) && (
        <div>
          <h2 className="font-semibold text-gray-900 mb-4 text-sm">Choose a Plan</h2>
          <div className="grid grid-cols-1 gap-3">
            {plans.map((plan) => (
              <div key={plan.id} className={`bg-white rounded-xl border-2 p-5 flex items-center justify-between ${plan.interval === "MONTHLY" ? "border-blue-500" : "border-gray-200"}`}>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900">{plan.name}</p>
                    {plan.interval === "MONTHLY" && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Popular</span>}
                    {plan.interval === "YEARLY" && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Best value</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{plan.creditsPerCycle} AI credits included</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="font-bold text-gray-900">${(plan.amountCents / 100).toFixed(2)}</p>
                    <p className="text-xs text-gray-400">{intervalLabel[plan.interval]}</p>
                  </div>
                  <form action="/api/billing/checkout" method="POST">
                    <input type="hidden" name="plan" value={plan.interval.toLowerCase()} />
                    <button type="submit" className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
                      Subscribe
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Credit balance + top-ups */}
      <div>
        <h2 className="font-semibold text-gray-900 mb-4 text-sm">AI Credits</h2>
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-4xl font-bold text-gray-900">{profile?.creditBalance ?? 0}</span>
            <span className="text-gray-500">credits remaining</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div className="h-2 rounded-full bg-blue-500" style={{ width: `${Math.min(100, ((profile?.creditBalance ?? 0) / 150) * 100)}%` }} />
          </div>
          <p className="text-xs text-gray-400 mt-2">{profile?.creditsLifetime ?? 0} credits earned lifetime</p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {packs.map((pack) => (
            <div key={pack.id} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{pack.credits}</p>
              <p className="text-xs text-gray-500 mt-0.5">credits</p>
              <p className="font-semibold text-gray-900 mt-2">${(pack.amountCents / 100).toFixed(2)}</p>
              <form action="/api/billing/topup" method="POST" className="mt-3">
                <input type="hidden" name="pack" value={pack.name.split(" ")[0]?.toLowerCase() ?? "starter"} />
                <button type="submit" className="w-full px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors">
                  Buy
                </button>
              </form>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}