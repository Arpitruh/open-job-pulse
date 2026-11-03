import { db } from "@ojp/db";

export const CREDIT_COSTS = {
  COVER_LETTER_GENERATE: 10,
  COVER_LETTER_REGENERATE: 5,
  RESUME_OPTIMIZE: 15,
  RESUME_RERUN: 8,
  SKILLS_GAP: 20,
  SKILLS_GAP_REFRESH: 10,
} as const;

export type CreditFeature = keyof typeof CREDIT_COSTS;

export async function checkAndDeductCredits(
  userId: string,
  feature: CreditFeature,
  description: string
): Promise<{ success: boolean; balance: number; error?: string }> {
  const cost = CREDIT_COSTS[feature];

  const profile = await db.userProfile.findUnique({
    where: { userId },
    select: { creditBalance: true },
  });

  if (!profile) {
    return { success: false, balance: 0, error: "Profile not found" };
  }

  if (profile.creditBalance < cost) {
    return {
      success: false,
      balance: profile.creditBalance,
      error: `Insufficient credits. Need ${cost}, have ${profile.creditBalance}`,
    };
  }

  const newBalance = profile.creditBalance - cost;

  await db.$transaction([
    db.userProfile.update({
      where: { userId },
      data: { creditBalance: newBalance },
    }),
    db.creditTransaction.create({
      data: {
        userId,
        type: "FEATURE_DEDUCT",
        amount: -cost,
        balance: newBalance,
        description,
        metadata: { feature, cost },
      },
    }),
  ]);

  return { success: true, balance: newBalance };
}

export async function refundCredits(
  userId: string,
  amount: number,
  description: string
): Promise<void> {
  const profile = await db.userProfile.findUnique({
    where: { userId },
    select: { creditBalance: true },
  });
  if (!profile) return;

  const newBalance = profile.creditBalance + amount;

  await db.$transaction([
    db.userProfile.update({
      where: { userId },
      data: { creditBalance: newBalance },
    }),
    db.creditTransaction.create({
      data: {
        userId,
        type: "REFUND",
        amount,
        balance: newBalance,
        description,
      },
    }),
  ]);
}