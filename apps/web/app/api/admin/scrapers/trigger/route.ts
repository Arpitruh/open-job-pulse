import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@ojp/db";
import { ingestionQueue } from "@ojp/queue";
import { z } from "zod";

const Schema = z.object({ scraperId: z.string() });

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

  const scraper = await db.scraperConfig.findUnique({
    where: { id: body.scraperId },
  });

  if (!scraper) {
    return NextResponse.json({ error: "Scraper not found" }, { status: 404 });
  }

  await ingestionQueue.add(
    "run-scraper",
    {
      scraperConfigId: scraper.id,
      workspaceId: scraper.workspaceId,
      adapterType: scraper.adapterType,
      sourceUrl: scraper.sourceUrl,
    },
    { jobId: `manual-${scraper.id}-${Date.now()}` }
  );

  await db.adminAuditLog.create({
    data: {
      adminId: session.user.id,
      action: "trigger_scraper",
      targetType: "scraper",
      targetId: body.scraperId,
    },
  });

  return NextResponse.json({ success: true });
}