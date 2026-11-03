import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@ojp/db";
import { z } from "zod";

const Schema = z.object({
  telegramChatId: z.string().nullable(),
  emailDigest: z.enum(["instant", "daily", "weekly", "none"]),
});

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof Schema>;
  try {
    body = Schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  await db.userProfile.update({
    where: { userId: session.user.id },
    data: {
      telegramChatId: body.telegramChatId,
      emailDigest: body.emailDigest,
    },
  });

  return NextResponse.json({ success: true });
}