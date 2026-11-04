import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@ojp/db";
import { verifyOtp, normalizePhone } from "@/lib/twilio";

const Schema = z.object({
  phone: z.string().min(7).max(20),
  code: z.string().length(6),
});

export async function POST(req: NextRequest) {
  // ── Auth check ────────────────────────────────────────────────────────────
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: z.infer<typeof Schema>;
  try {
    body = Schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const phone = normalizePhone(body.phone);

  const owner = await db.user.findUnique({ where: { phoneNumber: phone } });
  if (owner && owner.id !== userId) {
    return NextResponse.json({ error: "Phone number already registered." }, { status: 409 });
  }

  // ── Verify OTP ────────────────────────────────────────────────────────────
  const result = await verifyOtp(phone, body.code);
  if (!result.valid) {
    return NextResponse.json(
      { error: "Invalid or expired code. Please try again." },
      { status: 400 }
    );
  }

  // ── Save phone + check identity lock ─────────────────────────────────────
  const user = await db.user.update({
    where: { id: userId },
    data: {
      phoneNumber: phone,
      phoneVerified: true,
    },
    select: {
      linkedinId: true,
      phoneVerified: true,
      identityLockedAt: true,
    },
  });

  // ── Complete identity lock if LinkedIn also connected ────────────────────
  let identityLocked = false;
  if (user.linkedinId && user.phoneVerified && !user.identityLockedAt) {
    await db.user.update({
      where: { id: userId },
      data: { identityLockedAt: new Date() },
    });
    identityLocked = true;
  }

  return NextResponse.json({
    success: true,
    phoneVerified: true,
    identityLocked,
    nextStep: identityLocked ? "/dashboard" : "/onboarding/connect-linkedin",
  });
}