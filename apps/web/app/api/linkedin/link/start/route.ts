import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createLinkIntent, LINK_COOKIE } from "@/lib/linkedin-link-intent";
import { db } from "@ojp/db";

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin || origin !== req.nextUrl.origin) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const user = await db.user.findUnique({ where: { id: session.user.id }, select: { linkedinId: true } });
  if (!user || user.linkedinId) return NextResponse.json({ error: "LinkedIn is already connected or account unavailable" }, { status: 409 });
  const res = NextResponse.json({ success: true });
  res.cookies.set(LINK_COOKIE, createLinkIntent(session.user.id), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
    path: "/api/auth", maxAge: 300,
  });
  return res;
}
