import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { stripe, STRIPE_PLANS, type PlanKey } from "@/lib/stripe";
import { db } from "@ojp/db";
import { z } from "zod";

const Schema = z.object({
  plan: z.enum(["weekly", "monthly", "yearly"]),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof Schema>;
  try {
    body = Schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  // Get Stripe customer ID
  const subscription = await db.subscription.findUnique({
    where: { userId: session.user.id },
    select: { stripeCustomerId: true, status: true },
  });

  if (!subscription) {
    return NextResponse.json(
      { error: "No subscription record found" },
      { status: 404 }
    );
  }

  const priceId = STRIPE_PLANS[body.plan as PlanKey];

  const checkoutSession = await stripe.checkout.sessions.create({
    customer: subscription.stripeCustomerId,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXTAUTH_URL}/settings/billing?success=true`,
    cancel_url: `${process.env.NEXTAUTH_URL}/settings/billing?cancelled=true`,
    metadata: { userId: session.user.id, plan: body.plan },
    subscription_data: {
      metadata: { userId: session.user.id },
    },
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: checkoutSession.url });
}