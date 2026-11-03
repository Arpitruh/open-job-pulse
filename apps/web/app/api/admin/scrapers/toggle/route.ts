import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@ojp/db";
import { z } from "zod";

const Schema = z.object({
  scraperId: z.string(),
  enabled: z.boolean(),
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
    db.scraperConfig.update({
      where: { id: body.scraperId },
      data: { enabled: body.enabled },
    }),
    db.adminAuditLog.create({
      data: {
        adminId: session.user.id,
        action: body.enabled ? "enable_scraper" : "disable_scraper",
        targetType: "scraper",
        targetId: body.scraperId,
      },
    }),
  ]);

  return NextResponse.json({ success: true });
}