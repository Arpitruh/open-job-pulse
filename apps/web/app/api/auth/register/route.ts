import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hash } from "argon2";
import crypto from "crypto";
import { db } from "@ojp/db";
import { stripe } from "@/lib/stripe";

const RegisterSchema = z.object({
  fullName: z.string().min(2).max(100),
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(128),
});

type RegisterBody = z.infer<typeof RegisterSchema>;

function hashIdentifier(value: string): string {
  return crypto.createHash("sha256").update(value.toLowerCase()).digest("hex");
}

export async function POST(req: NextRequest) {
  // ── 1. Parse & validate body ──────────────────────────────────────────────
  let body: RegisterBody;
  try {
    body = RegisterSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "Invalid input", details: err },
      { status: 400 }
    );
  }

  const { fullName, email, password } = body;
  const emailHash = hashIdentifier(email);

  // ── 2. Dedup check — email in BlockedIdentity ────────────────────────────
  const [blockedByEmail, existingUser] = await Promise.all([
    db.blockedIdentity.findUnique({ where: { emailHash } }),
    db.user.findUnique({ where: { email } }),
  ]);

  if (blockedByEmail || existingUser) {
    // Generic message — never reveal which check fired
    return NextResponse.json(
      {
        error:
          "An account already exists with this identity. Contact support if you believe this is an error.",
      },
      { status: 409 }
    );
  }

  // ── 3. Hash password ──────────────────────────────────────────────────────
  const passwordHash = await hash(password, {
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  // ── 4. Create user + profile + Stripe customer + subscription in one tx ──
  let createdCustomerId: string | null = null;
  let createdSubscriptionId: string | null = null;
  try {
    // Create Stripe customer first (outside tx — external call)
    const stripeCustomer = await stripe.customers.create({
      email,
      name: fullName,
      metadata: { source: "openjobpulse" },
    });

    createdCustomerId = stripeCustomer.id;
    // Start Stripe trial subscription
    const stripeSubscription = await stripe.subscriptions.create({
      customer: stripeCustomer.id,
      items: [{ price: process.env.STRIPE_PRICE_MONTHLY! }],
      trial_period_days: 7,
      payment_behavior: "default_incomplete",
      expand: ["latest_invoice.payment_intent"],
    });

    createdSubscriptionId = stripeSubscription.id;
    const trialEnd = new Date(stripeSubscription.trial_end! * 1000);

    // DB transaction
    const user = await db.$transaction(async (tx) => {
      // Create user
      const newUser = await tx.user.create({
        data: {
          email,
          passwordHash,
          role: email === process.env.ADMIN_EMAIL ? "ADMIN" : "USER",
        },
      });

      // Create profile
      await tx.userProfile.create({
        data: {
          userId: newUser.id,
          fullName,
          creditBalance: 50,
          creditsLifetime: 50,
        },
      });

      // Create subscription record
      await tx.subscription.create({
        data: {
          userId: newUser.id,
          stripeCustomerId: stripeCustomer.id,
          stripeSubscriptionId: stripeSubscription.id,
          status: "TRIALING",
          trialEnd,
          currentPeriodStart: new Date(),
          currentPeriodEnd: trialEnd,
        },
      });

      // Record trial credit grant
      await tx.creditTransaction.create({
        data: {
          userId: newUser.id,
          type: "TRIAL_GRANT",
          amount: 50,
          balance: 50,
          description: "7-day trial credit grant",
        },
      });

      // Create default workspace
      const workspace = await tx.workspace.create({
        data: {
          name: `${fullName}'s Workspace`,
          slug: `${newUser.id}-workspace`,
        },
      });

      await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: newUser.id,
          role: "owner",
        },
      });

      return newUser;
    });

    return NextResponse.json(
      {
        success: true,
        userId: user.id,
        nextStep: "/onboarding/verify-phone",
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("[Register] Error:", err);
    // Compensate for Stripe resources created before a failed DB transaction.
    // Deleting the customer also removes its subscriptions.
    if (createdCustomerId) {
      try {
        await stripe.customers.del(createdCustomerId);
      } catch (cleanupError) {
        console.error("[Register] Stripe cleanup failed:", cleanupError, { createdCustomerId, createdSubscriptionId });
      }
    }
    return NextResponse.json(
      { error: "Registration failed. Please try again." },
      { status: 500 }
    );
  }
}