import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@ojp/db";
import { stripe } from "@/lib/stripe";
import crypto from "crypto";
import { z } from "zod";

const Schema = z.object({
  userId: z.string(),
  reason: z.string(),
});

function hashIdentifier(value: string): string {
  return crypto.createHash("sha256").update(value.toLowerCase()).digest("hex");
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: z.infer<typeof Schema>;
  try {
    body = Schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const user = await db.user.findUnique({
    where: { id: body.userId },
    include: { subscription: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Hash identifiers for BlockedIdentity
  const emailHash = hashIdentifier(user.email);
  const phoneHash = user.phoneNumber
    ? hashIdentifier(user.phoneNumber)
    : null;

  await db.$transaction(async (tx) => {
    // Create blocked identity record
    await tx.blockedIdentity.upsert({
      where: { emailHash },
      update: {
        reason: body.reason,
        blockedBy: session.user.id,
        ...(phoneHash && { phoneHash }),
        ...(user.linkedinId && { linkedinId: user.linkedinId }),
      },
      create: {
        emailHash,
        ...(phoneHash && { phoneHash }),
        ...(user.linkedinId && { linkedinId: user.linkedinId }),
        reason: body.reason,
        blockedBy: session.user.id,
      },
    });

    // Write admin audit log
    await tx.adminAuditLog.create({
      data: {
        adminId: session.user.id,
        action: "ban_user",
        targetType: "user",
        targetId: body.userId,
        metadata: { reason: body.reason, email: user.email },
      },
    });
  });

  // Cancel Stripe subscription
  if (user.subscription?.stripeSubscriptionId) {
    try {
      await stripe.subscriptions.cancel(
        user.subscription.stripeSubscriptionId
      );
      await db.subscription.update({
        where: { userId: body.userId },
        data: { status: "CANCELLED" },
      });
    } catch (err: any) {
      console.error("[Admin Ban] Stripe cancel failed:", err.message);
    }
  }

  return NextResponse.json({ success: true });
}