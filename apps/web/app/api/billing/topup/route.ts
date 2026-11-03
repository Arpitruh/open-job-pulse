import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { stripe, STRIPE_PACKS, type PackKey } from "@/lib/stripe";
import { db } from "@ojp/db";
import { z } from "zod";

const Schema = z.object({
  pack: z.enum(["starter", "pro", "power"]),
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
    return NextResponse.json({ error: "Invalid pack" }, { status: 400 });
  }

  const subscription = await db.subscription.findUnique({
    where: { userId: session.user.id },
    select: { stripeCustomerId: true },
  });

  if (!subscription) {
    return NextResponse.json({ error: "No subscription found" }, { status: 404 });
  }

  // Fetch the credit pack details
  const priceId = STRIPE_PACKS[body.pack as PackKey];
  const pack = await db.creditPack.findUnique({
    where: { stripePriceId: priceId },
    select: { credits: true, amountCents: true, name: true },
  });

  if (!pack) {
    return NextResponse.json({ error: "Pack not found" }, { status: 404 });
  }

  // Create one-time checkout session
  const checkoutSession = await stripe.checkout.sessions.create({
    customer: subscription.stripeCustomerId,
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXTAUTH_URL}/settings/billing?topup=success`,
    cancel_url: `${process.env.NEXTAUTH_URL}/settings/billing?topup=cancelled`,
    payment_intent_data: {
      metadata: {
        userId: session.user.id,
        packId: body.pack,
        credits: pack.credits.toString(),
      },
    },
  });

  return NextResponse.json({ url: checkoutSession.url });
}