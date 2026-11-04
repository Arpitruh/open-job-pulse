import { NextRequest, NextResponse } from "next/server";
import { db } from "@ojp/db";
import { Resend } from "resend";
import crypto from "crypto";
import { Redis } from "ioredis";

export async function POST(req: NextRequest) {
  const generic = { message: "If that email is registered, a reset link will be sent." };
  const { email } = await req.json().catch(() => ({ email: null }));
  if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }
  if (!process.env.REDIS_URL) return NextResponse.json({ error: "Recovery unavailable." }, { status: 503 });
  const redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, connectTimeout: 2000, maxRetriesPerRequest: 1 });
  try {
    const key = "reset:" + crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 900);
    const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const ipKey = "reset-ip:" + crypto.createHash("sha256").update(ip).digest("hex");
    const ipCount = await redis.incr(ipKey);
    if (ipCount === 1) await redis.expire(ipKey, 900);
    if (count > 3 || ipCount > 10) return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  } catch {
    return NextResponse.json({ error: "Recovery unavailable." }, { status: 503 });
  } finally {
    redis.disconnect();
  }
  const secret = process.env.PASSWORD_RESET_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret || !process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    console.error("Password reset email configuration missing");
    return NextResponse.json({ error: "Password recovery is temporarily unavailable." }, { status: 503 });
  }
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (user) {
    const expires = Date.now() + 15 * 60_000;
    const payload = Buffer.from(JSON.stringify({ userId: user.id, expires })).toString("base64url");
    const signature = crypto.createHmac("sha256", secret).update(payload + "." + (user.passwordHash || "")).digest("hex");
    const origin = process.env.NEXTAUTH_URL;
    if (!origin) return NextResponse.json({ error: "Password recovery is temporarily unavailable." }, { status: 503 });
    const url = new URL("/reset-password", origin);
    url.searchParams.set("token", payload + "." + signature);
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const result = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL,
        to: user.email,
        subject: "Reset your Open Job Pulse password",
        text: "Reset your password using this link (expires in 15 minutes): " + url.toString() + "\nIf you did not request this, ignore this email.",
      });
      if (result.error) throw new Error(result.error.message);
    } catch (error) {
      console.error("Password reset email delivery failed", error);
      return NextResponse.json({ error: "Unable to send reset email right now." }, { status: 503 });
    }
  }
  return NextResponse.json(generic);
}
