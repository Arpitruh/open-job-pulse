import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import crypto from "crypto";
import { issueOAuthIntent } from "@/lib/oauth-intent";

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin || origin !== req.nextUrl.origin) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }
  if (!process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: "Auth configuration missing" }, { status: 500 });
  }
  let nonce: string;
  try { nonce = await issueOAuthIntent("link"); }
  catch { return NextResponse.json({ error: "OAuth temporarily unavailable" }, { status: 503 }); }
  const payload = Buffer.from(JSON.stringify({
    nonce,
    userId: session.user.id,
    expires: Date.now() + 5 * 60 * 1000,
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", process.env.NEXTAUTH_SECRET)
    .update(payload).digest("hex");
  const res = NextResponse.json({ ok: true });
  res.cookies.set("ojp_link_linkedin", payload + "." + signature, {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "lax", path: "/", maxAge: 300,
  });
  return res;
}
