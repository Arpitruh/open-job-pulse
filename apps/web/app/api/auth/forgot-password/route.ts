import { NextRequest, NextResponse } from "next/server";
import { db } from "@ojp/db";
import { isNotificationServiceConfigured, sendPasswordResetEmail } from "@/lib/notification-service";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  const generic = { message: "If that email is registered, a reset link will be sent." };
  const { email } = await req.json().catch(() => ({ email: null }));
  if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }
  const secret = process.env.PASSWORD_RESET_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret || !isNotificationServiceConfigured()) {
    console.error("Password reset email configuration missing");
    return NextResponse.json({ error: "Password recovery is temporarily unavailable." }, { status: 503 });
  }
  const origin = process.env.NEXTAUTH_URL;
  if (!origin) return NextResponse.json({ error: "Password recovery is temporarily unavailable." }, { status: 503 });
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (user) {
    const expires = Date.now() + 15 * 60_000;
    const payload = Buffer.from(JSON.stringify({ userId: user.id, expires })).toString("base64url");
    const signature = crypto.createHmac("sha256", secret).update(payload + "." + (user.passwordHash || "")).digest("hex");
    const url = new URL("/reset-password", origin);
    url.searchParams.set("token", payload + "." + signature);
    try {
      // The Notification Service owns the email template and delivery retries.
      // A new signed token produces a new key; a retry of this request is safe.
      await sendPasswordResetEmail(
        user.email,
        url.toString(),
        "password-reset:" + crypto.createHash("sha256").update(payload).digest("hex")
      );
    } catch (error) {
      console.error("[Password reset] Notification Service unavailable:", error);
      // Preserve account enumeration resistance even when delivery fails.
      // Operations alerts must surface this failure to the application owner.
    }
  }
  return NextResponse.json(generic);
}
