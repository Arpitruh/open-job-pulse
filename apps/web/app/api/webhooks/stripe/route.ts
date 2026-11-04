import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { db } from "@ojp/db";
import Stripe from "stripe";

// App Router request.text() reads the raw webhook payload for signature verification.

// Map Stripe subscription status → our enum
function mapStatus(
  stripeStatus: Stripe.Subscription.Status
): "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "INCOMPLETE" {
  const map: Record<
    string,
    "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "INCOMPLETE"
  > = {
    trialing: "TRIALING",
    active: "ACTIVE",
    past_due: "PAST_DUE",
    canceled: "CANCELLED",
    cancelled: "CANCELLED",
    incomplete: "INCOMPLETE",
    incomplete_expired: "CANCELLED",
    unpaid: "PAST_DUE",
    paused: "PAST_DUE",
  };
  return map[stripeStatus] ?? "INCOMPLETE";
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  // ── Verify webhook signature ────────────────────────────────────────────
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error("[Stripe Webhook] Signature verification failed:", err.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  console.log(`[Stripe Webhook] Event: ${event.type}`);

  try {
    switch (event.type) {
      // ── Checkout completed → activate subscription ──────────────────────
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") break;

        const stripeSubscriptionId = session.subscription as string;
        const stripeCustomerId = session.customer as string;

        // Fetch full subscription details
        const subscription = await stripe.subscriptions.retrieve(
          stripeSubscriptionId
        );

        // Find which plan they purchased
        const stripePriceId = subscription.items.data[0]?.price.id;
        const plan = stripePriceId
          ? await db.plan.findUnique({ where: { stripePriceId } })
          : null;

        await db.subscription.update({
          where: { stripeCustomerId },
          data: {
            stripeSubscriptionId,
            status: mapStatus(subscription.status),
            planId: plan?.id ?? null,
            currentPeriodStart: new Date(
              subscription.current_period_start * 1000
            ),
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            trialEnd: subscription.trial_end
              ? new Date(subscription.trial_end * 1000)
              : null,
          },
        });

        // Grant plan credits
        if (plan?.creditsPerCycle && plan.creditsPerCycle > 0) {
          const sub = await db.subscription.findUnique({
            where: { stripeCustomerId },
            select: { userId: true },
          });
          if (sub) {
            await grantPlanCredits(sub.userId, plan.creditsPerCycle, plan.name);
          }
        }
        break;
      }

      // ── Subscription updated → sync status + period ─────────────────────
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const stripeCustomerId = subscription.customer as string;

        const stripePriceId = subscription.items.data[0]?.price.id;
        const plan = stripePriceId
          ? await db.plan.findUnique({ where: { stripePriceId } })
          : null;

        await db.subscription.update({
          where: { stripeCustomerId },
          data: {
            status: mapStatus(subscription.status),
            planId: plan?.id ?? null,
            currentPeriodStart: new Date(
              subscription.current_period_start * 1000
            ),
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            trialEnd: subscription.trial_end
              ? new Date(subscription.trial_end * 1000)
              : null,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            paymentFailedAt: null, // clear on successful update
          },
        });
        break;
      }

      // ── Subscription deleted → cancel ────────────────────────────────────
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const stripeCustomerId = subscription.customer as string;

        await db.subscription.update({
          where: { stripeCustomerId },
          data: {
            status: "CANCELLED",
            cancelAtPeriodEnd: false,
          },
        });
        break;
      }

      // ── Payment failed → grace period ────────────────────────────────────
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const stripeCustomerId = invoice.customer as string;

        await db.subscription.update({
          where: { stripeCustomerId },
          data: {
            status: "PAST_DUE",
            paymentFailedAt: new Date(),
          },
        });
        break;
      }

      // ── Invoice paid → clear past due ─────────────────────────────────────
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const stripeCustomerId = invoice.customer as string;

        // Only update if currently past due
        const sub = await db.subscription.findUnique({
          where: { stripeCustomerId },
          select: { status: true },
        });
        if (sub?.status === "PAST_DUE") {
          await db.subscription.update({
            where: { stripeCustomerId },
            data: { status: "ACTIVE", paymentFailedAt: null },
          });
        }
        break;
      }

      // ── Trial ending in 3 days → send reminder ───────────────────────────
      case "customer.subscription.trial_will_end": {
        const subscription = event.data.object as Stripe.Subscription;
        const stripeCustomerId = subscription.customer as string;

        const sub = await db.subscription.findUnique({
          where: { stripeCustomerId },
          include: { user: { select: { email: true } } },
        });

        if (sub?.user.email) {
          await sendTrialEndingEmail(sub.user.email);
        }
        break;
      }

      // ── Credit top-up payment succeeded ─────────────────────────────────
     case "payment_intent.succeeded": {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  const { userId, credits } = paymentIntent.metadata;
  const packId = paymentIntent.metadata["packId"] ?? "unknown";

  if (userId && credits) {
    await grantTopupCredits(
      userId,
      parseInt(credits),
      paymentIntent.id,
      packId
    );
  }
  break;
}

      default:
        console.log(`[Stripe Webhook] Unhandled event: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("[Stripe Webhook] Handler error:", err.message);
    // Always return 200 to Stripe — log the error separately
    return NextResponse.json({ received: true, error: err.message });
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function grantPlanCredits(
  userId: string,
  amount: number,
  planName: string
) {
  const profile = await db.userProfile.findUnique({
    where: { userId },
    select: { creditBalance: true },
  });
  if (!profile) return;

  const newBalance = profile.creditBalance + amount;

  await db.$transaction([
    db.userProfile.update({
      where: { userId },
      data: { creditBalance: newBalance, creditsLifetime: { increment: amount } },
    }),
    db.creditTransaction.create({
      data: {
        userId,
        type: "PLAN_GRANT",
        amount,
        balance: newBalance,
        description: `${planName} plan credit grant`,
      },
    }),
  ]);
}

async function grantTopupCredits(
  userId: string,
  amount: number,
  stripePaymentId: string,
  packId: string
) {
  const profile = await db.userProfile.findUnique({
    where: { userId },
    select: { creditBalance: true },
  });
  if (!profile) return;

  const newBalance = profile.creditBalance + amount;

  await db.$transaction([
    db.userProfile.update({
      where: { userId },
      data: { creditBalance: newBalance, creditsLifetime: { increment: amount } },
    }),
    db.creditTransaction.create({
      data: {
        userId,
        type: "TOPUP_PURCHASE",
        amount,
        balance: newBalance,
        description: `Credit top-up purchase`,
        metadata: { stripePaymentId, packId },
      },
    }),
  ]);
}

async function sendTrialEndingEmail(email: string) {
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL!,
      to: email,
      subject: "Your OpenJobPulse trial ends in 3 days",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;">
          <h2 style="color:#1d4ed8;">Your trial ends in 3 days</h2>
          <p>You've been using OpenJobPulse free for the past 4 days.
             Don't lose access to your job matches, AI tools, and alerts.</p>
          <a href="${process.env.NEXTAUTH_URL}/settings/billing"
             style="display:inline-block;background:#1d4ed8;color:#fff;
                    padding:12px 24px;border-radius:8px;text-decoration:none;
                    font-weight:600;margin-top:16px;">
            Choose a Plan →
          </a>
          <p style="color:#6b7280;font-size:13px;margin-top:24px;">
            From $4.99/week · Cancel anytime
          </p>
        </div>
      `,
    });
  } catch (err) {
    console.error("[Email] Trial ending email failed:", err);
  }
}