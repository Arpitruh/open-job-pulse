import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@ojp/db";
import { callAi, decrypt } from "@ojp/ai";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await db.userProfile.findUnique({
    where: { userId: session.user.id },
    select: { aiApiKey: true, aiProvider: true },
  });

  if (!profile?.aiApiKey) {
    return NextResponse.json({ error: "No key configured" }, { status: 400 });
  }

  try {
    const response = await callAi(
      profile.aiApiKey,
      [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: 'Reply with exactly: "Key works!"' },
      ],
      { maxTokens: 20 }
    );

    return NextResponse.json({
      valid: true,
      provider:
        profile.aiProvider === "anthropic"
          ? "Anthropic Claude"
          : "OpenAI GPT-4o",
      model: response.model,
    });
  } catch (err: any) {
    return NextResponse.json({
      valid: false,
      error: err.message,
    });
  }
}