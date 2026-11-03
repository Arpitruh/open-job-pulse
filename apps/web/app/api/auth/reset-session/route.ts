import { NextResponse } from "next/server";

export async function GET() {
  const response = NextResponse.redirect("http://localhost:3000/login");
  response.cookies.delete("next-auth.session-token");
  response.cookies.delete("next-auth.csrf-token");
  response.cookies.delete("next-auth.callback-url");
  response.cookies.delete("__Secure-next-auth.session-token");
  return response;
}