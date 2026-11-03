import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

export async function proxy(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const { pathname } = req.nextUrl;

  // ── Admin route guard ─────────────────────────────────────────
  if (pathname.startsWith("/admin")) {
    if (!token || token.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return NextResponse.next();
  }

  // ── Dashboard route guard ─────────────────────────────────────
  if (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/kanban") ||
    pathname.startsWith("/skills-gap") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/analytics")
  ) {
    if (!token) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    if (
      !token.identityLockedAt &&
      !pathname.startsWith("/onboarding")
    ) {
      return NextResponse.redirect(
        new URL("/onboarding/verify-phone", req.url)
      );
    }
    return NextResponse.next();
  }

  // ── Auth routes — redirect if already logged in ───────────────
  if (pathname.startsWith("/login") || pathname.startsWith("/register")) {
    if (token) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/kanban/:path*",
    "/skills-gap/:path*",
    "/settings/:path*",
    "/analytics/:path*",
    "/admin/:path*",
    "/login",
    "/register",
    "/onboarding/:path*",
  ],
};