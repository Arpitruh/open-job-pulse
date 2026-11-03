import twilio from "twilio";
import { Redis } from "ioredis";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

const redis = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: 3,
});

const SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID!;
const MAX_ATTEMPTS = 3;
const WINDOW_SECONDS = 15 * 60; // 15 minutes

// ── Rate Limiting ────────────────────────────────────────────────────────────

export async function checkOtpRateLimit(phone: string): Promise<{
  allowed: boolean;
  attemptsLeft: number;
  resetIn: number;
}> {
  const key = `otp:rate:${phone}`;
  const attempts = await redis.incr(key);

  if (attempts === 1) {
    await redis.expire(key, WINDOW_SECONDS);
  }

  const ttl = await redis.ttl(key);

  if (attempts > MAX_ATTEMPTS) {
    return { allowed: false, attemptsLeft: 0, resetIn: ttl };
  }

  return {
    allowed: true,
    attemptsLeft: MAX_ATTEMPTS - attempts,
    resetIn: ttl,
  };
}

// ── Send OTP ─────────────────────────────────────────────────────────────────

export type OtpChannel = "sms" | "whatsapp";

export async function sendOtp(
  phone: string,
  channel: OtpChannel = "sms"
): Promise<{ success: boolean; error?: string }> {
  try {
    await client.verify.v2
      .services(SERVICE_SID)
      .verifications.create({ to: phone, channel });
    return { success: true };
  } catch (err: any) {
    console.error("[Twilio] sendOtp error:", err.message);
    return { success: false, error: err.message };
  }
}

// ── Verify OTP ───────────────────────────────────────────────────────────────

export async function verifyOtp(
  phone: string,
  code: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    const check = await client.verify.v2
      .services(SERVICE_SID)
      .verificationChecks.create({ to: phone, code });
    return { valid: check.status === "approved" };
  } catch (err: any) {
    console.error("[Twilio] verifyOtp error:", err.message);
    return { valid: false, error: err.message };
  }
}

// ── Normalize to E.164 ───────────────────────────────────────────────────────

export function normalizePhone(phone: string): string {
  // Strip everything except digits and leading +
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (!cleaned.startsWith("+")) return `+${cleaned}`;
  return cleaned;
}