import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@ojp/db";
import { z } from "zod";

const Schema = z.object({
  userId: z.string(),
  amount: z.number().int().min(1).max(10000),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: z.infer<typeof Schema>;
  try {
    body = Schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const profile = await db.userProfile.findUnique({
    where: { userId: body.userId },
    select: { creditBalance: true },
  });

  if (!profile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const newBalance = profile.creditBalance + body.amount;

  await db.$transaction([
    db.userProfile.update({
      where: { userId: body.userId },
      data: {
        creditBalance: newBalance,
        creditsLifetime: { increment: body.amount },
      },
    }),
    db.creditTransaction.create({
      data: {
        userId: body.userId,
        type: "ADMIN_GRANT",
        amount: body.amount,
        balance: newBalance,
        description: `Admin credit grant by ${session.user.email}`,
        metadata: { adminId: session.user.id },
      },
    }),
    db.adminAuditLog.create({
      data: {
        adminId: session.user.id,
        action: "grant_credits",
        targetType: "user",
        targetId: body.userId,
        metadata: { amount: body.amount, newBalance },
      },
    }),
  ]);

  return NextResponse.json({ success: true, newBalance });
}