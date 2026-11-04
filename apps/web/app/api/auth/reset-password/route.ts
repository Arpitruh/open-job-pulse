import { NextRequest, NextResponse } from "next/server";
import { db } from "@ojp/db";
import { hash } from "argon2";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  const { token, password } = await req.json().catch(() => ({ token: null, password: null }));
  if (typeof token !== "string" || token.length > 3000 ||
      typeof password !== "string" || password.length < 8 || password.length > 128) {
    return NextResponse.json({ error: "Invalid token or password (8–128 characters required)." }, { status: 400 });
  }
  const secret = process.env.PASSWORD_RESET_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) return NextResponse.json({ error: "Password recovery unavailable." }, { status: 503 });
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra || !/^[a-f0-9]{64}$/.test(signature)) {
    return NextResponse.json({ error: "Invalid or expired reset link." }, { status: 400 });
  }
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as { userId?: string; expires?: number };
    if (typeof payload.userId !== "string" || !Number.isFinite(payload.expires) || (payload.expires ?? 0) < Date.now()) {
      return NextResponse.json({ error: "Invalid or expired reset link." }, { status: 400 });
    }
    const user = await db.user.findUnique({ where: { id: payload.userId } });
    if (!user) return NextResponse.json({ error: "Invalid or expired reset link." }, { status: 400 });
    const expected = crypto.createHmac("sha256", secret).update(encoded + "." + (user.passwordHash || "")).digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"))) {
      return NextResponse.json({ error: "Invalid or expired reset link." }, { status: 400 });
    }
    const passwordHash = await hash(password);
    const updated = await db.user.updateMany({ where: { id: user.id, passwordHash: user.passwordHash }, data: { passwordHash } });
    if (updated.count !== 1) return NextResponse.json({ error: "Reset link already used." }, { status: 400 });
    return NextResponse.json({ message: "Password updated. You can now sign in." });
  } catch {
    return NextResponse.json({ error: "Invalid or expired reset link." }, { status: 400 });
  }
}
