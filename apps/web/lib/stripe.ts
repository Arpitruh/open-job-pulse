import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
  typescript: true,
});

export const STRIPE_PLANS = {
  weekly: process.env.STRIPE_PRICE_WEEKLY!,
  monthly: process.env.STRIPE_PRICE_MONTHLY!,
  yearly: process.env.STRIPE_PRICE_YEARLY!,
} as const;

export const STRIPE_PACKS = {
  starter: process.env.STRIPE_PACK_STARTER!,
  pro: process.env.STRIPE_PACK_PRO!,
  power: process.env.STRIPE_PACK_POWER!,
} as const;

export type PlanKey = keyof typeof STRIPE_PLANS;
export type PackKey = keyof typeof STRIPE_PACKS;