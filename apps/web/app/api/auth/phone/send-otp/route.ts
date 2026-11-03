import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@ojp/db";
import {
  sendOtp,
  checkOtpRateLimit,
  normalizePhone,
  type OtpChannel,
} from "@/lib/twilio";
import crypto from "crypto";

const Schema = z.object({
  phone: z.string().min(7).max(20),
  channel: z.enum(["sms", "whatsapp"]).default("sms"),
});

function hashIdentifier(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export async function POST(req: NextRequest) {
  // ── Auth check ────────────────────────────────────────────────────────────
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: z.infer<typeof Schema>;
  try {
    body = Schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const phone = normalizePhone(body.phone);
  const channel = body.channel as OtpChannel;

  // ── Rate limit check ──────────────────────────────────────────────────────
  const rateLimit = await checkOtpRateLimit(phone);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: `Too many attempts. Try again in ${Math.ceil(rateLimit.resetIn / 60)} minutes.`,
      },
      { status: 429 }
    );
  }

  // ── Dedup: check phone not already registered or blocked ─────────────────
  const phoneHash = hashIdentifier(phone);
  const [existingPhone, blocked] = await Promise.all([
    db.user.findUnique({ where: { phoneNumber: phone } }),
    db.blockedIdentity.findUnique({ where: { phoneHash } }),
  ]);

  if (existingPhone || blocked) {
    return NextResponse.json(
      {
        error:
          "An account already exists with this identity. Contact support if you believe this is an error.",
      },
      { status: 409 }
    );
  }

  // ── Send OTP via Twilio Verify ────────────────────────────────────────────
  const result = await sendOtp(phone, channel);
  if (!result.success) {
    return NextResponse.json(
      { error: "Failed to send verification code. Check the number and try again." },
      { status: 502 }
    );
  }

  return NextResponse.json({
    success: true,
    channel,
    attemptsLeft: rateLimit.attemptsLeft,
    message: `Verification code sent via ${channel === "whatsapp" ? "WhatsApp" : "SMS"}`,
  });
}