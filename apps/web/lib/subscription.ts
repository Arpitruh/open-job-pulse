import { db } from "@ojp/db";

export type SubscriptionGuardResult =
  | { allowed: true }
  | { allowed: false; reason: "no_subscription" | "trial_expired" | "past_due" | "cancelled" };

export async function checkSubscriptionAccess(
  userId: string
): Promise<SubscriptionGuardResult> {
  const sub = await db.subscription.findUnique({
    where: { userId },
    select: { status: true, trialEnd: true },
  });

  if (!sub) return { allowed: false, reason: "no_subscription" };

  if (sub.status === "ACTIVE" || sub.status === "TRIALING") {
    // Extra guard: if trialing, check trial hasn't expired
    if (sub.status === "TRIALING" && sub.trialEnd) {
      if (new Date() > sub.trialEnd) {
        return { allowed: false, reason: "trial_expired" };
      }
    }
    return { allowed: true };
  }

  if (sub.status === "PAST_DUE") return { allowed: false, reason: "past_due" };
  return { allowed: false, reason: "cancelled" };
}

export async function getTrialDaysLeft(userId: string): Promise<number> {
  const sub = await db.subscription.findUnique({
    where: { userId },
    select: { trialEnd: true },
  });
  if (!sub?.trialEnd) return 0;
  const msLeft = sub.trialEnd.getTime() - Date.now();
  return Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
}