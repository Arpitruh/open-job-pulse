import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@ojp/db";
import { z } from "zod";

const Schema = z.object({
  ids: z.array(z.string()),
  reason: z.string(),
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

  await db.$transaction([
    db.jobListing.updateMany({
      where: { id: { in: body.ids } },
      data: {
        isFlagged: true,
        flagReason: body.reason,
        flaggedAt: new Date(),
        flaggedBy: session.user.id,
      },
    }),
    db.adminAuditLog.create({
      data: {
        adminId: session.user.id,
        action: "flag_listing",
        targetType: "listing",
        targetId: body.ids.join(","),
        metadata: { reason: body.reason, count: body.ids.length },
      },
    }),
  ]);

  return NextResponse.json({ success: true });
}