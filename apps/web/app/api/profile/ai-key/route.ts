import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@ojp/db";
import { encrypt } from "@/lib/encrypt";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { apiKey } = await req.json();
  if (!apiKey?.trim()) {
    return NextResponse.json({ error: "API key required" }, { status: 400 });
  }

  const provider = apiKey.startsWith("sk-ant-") ? "anthropic" : "openai";
  const encrypted = encrypt(apiKey.trim());

  await db.userProfile.update({
    where: { userId: session.user.id },
    data: { aiApiKey: encrypted, aiProvider: provider },
  });

  return NextResponse.json({ success: true, provider });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await db.userProfile.update({
    where: { userId: session.user.id },
    data: { aiApiKey: null, aiProvider: null },
  });

  return NextResponse.json({ success: true });
}