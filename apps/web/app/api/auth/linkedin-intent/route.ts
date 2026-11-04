import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { issueOAuthIntent } from "@/lib/oauth-intent";

export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== req.nextUrl.origin) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  const { mode } = await req.json().catch(() => ({ mode: null }));
  if (mode !== "login" && mode !== "signup") {
    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  }
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return NextResponse.json({ error: "Missing auth secret" }, { status: 500 });
  let nonce: string;
  try { nonce = await issueOAuthIntent("mode"); }
  catch { return NextResponse.json({ error: "OAuth temporarily unavailable" }, { status: 503 }); }
  const payload = Buffer.from(JSON.stringify({ mode, nonce, expires: Date.now() + 300000 })).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const res = NextResponse.json({ ok: true });
  res.cookies.set("ojp_linkedin_mode", payload + "." + signature, {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "lax", path: "/", maxAge: 300,
  });
  return res;
}
