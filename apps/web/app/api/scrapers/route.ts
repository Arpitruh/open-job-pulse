import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@ojp/db";
import { z } from "zod";

const CreateSchema = z.object({
  label: z.string().min(1).max(100),
  adapterType: z.enum(["GREENHOUSE", "LEVER", "RSS_ATOM", "WORKDAY", "CUSTOM_PLUGIN"]),
  sourceUrl: z.string().url(),
  cronSchedule: z.string().default("0 */4 * * *"),
  workspaceId: z.string(),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof CreateSchema>;
  try {
    body = CreateSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // Verify user is member of workspace
  const membership = await db.workspaceMember.findFirst({
    where: { userId: session.user.id, workspaceId: body.workspaceId },
  });

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const scraper = await db.scraperConfig.create({
    data: {
      workspaceId: body.workspaceId,
      label: body.label,
      adapterType: body.adapterType,
      sourceUrl: body.sourceUrl,
      cronSchedule: body.cronSchedule,
    },
  });

  return NextResponse.json({ success: true, scraper });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "ID required" }, { status: 400 });
  }

  // Verify ownership
  const scraper = await db.scraperConfig.findFirst({
    where: {
      id,
      workspace: { members: { some: { userId: session.user.id } } },
    },
  });

  if (!scraper) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.scraperConfig.delete({ where: { id } });
  return NextResponse.json({ success: true });
}