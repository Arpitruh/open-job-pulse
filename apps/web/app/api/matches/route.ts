import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@ojp/db";
import { z } from "zod";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: 3,
});

const UpdateSchema = z.object({
  matchId: z.string(),
  status: z.enum([
    "DISCOVERED",
    "APPLIED",
    "INTERVIEWING",
    "OFFER_RECEIVED",
    "REJECTED",
    "ARCHIVED",
  ]),
});

const NoteSchema = z.object({
  matchId: z.string(),
  notes: z.string().max(5000),
});

// ── PATCH — update status ────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof UpdateSchema>;
  try {
    body = UpdateSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // Verify match belongs to user
  const match = await db.jobMatch.findFirst({
    where: { id: body.matchId, userId: session.user.id },
  });

  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const updated = await db.jobMatch.update({
    where: { id: body.matchId },
    data: {
      status: body.status,
      appliedAt:
        body.status === "APPLIED" && !match.appliedAt
          ? new Date()
          : match.appliedAt,
      activityLog: {
        create: {
          type: "status_change",
          payload: {
            from: match.status,
            to: body.status,
            changedAt: new Date().toISOString(),
          },
        },
      },
    },
    include: {
      jobListing: {
        select: {
          companyName: true,
          jobTitle: true,
          workMode: true,
          baseSalaryMin: true,
          baseSalaryMax: true,
          currency: true,
          applyUrl: true,
        },
      },
    },
  });

  // Publish SSE event to user's Redis channel
  await redis.publish(
    `sse:${session.user.id}`,
    JSON.stringify({
      event: "match_status_updated",
      data: {
        matchId: body.matchId,
        status: body.status,
        updatedAt: new Date().toISOString(),
      },
    })
  );

  return NextResponse.json({ success: true, match: updated });
}

// ── PUT — update notes ───────────────────────────────────────────────────────
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof NoteSchema>;
  try {
    body = NoteSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const match = await db.jobMatch.findFirst({
    where: { id: body.matchId, userId: session.user.id },
  });

  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const updated = await db.jobMatch.update({
    where: { id: body.matchId },
    data: {
      notes: body.notes,
      activityLog: {
        create: {
          type: "note_added",
          payload: { updatedAt: new Date().toISOString() },
        },
      },
    },
  });

  return NextResponse.json({ success: true, match: updated });
}

// ── GET — fetch all matches for kanban ───────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const matches = await db.jobMatch.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      jobListing: {
        select: {
          companyName: true,
          jobTitle: true,
          workMode: true,
          baseSalaryMin: true,
          baseSalaryMax: true,
          currency: true,
          applyUrl: true,
          sourcePortal: true,
          postedAt: true,
          descriptionRaw: true,
        },
      },
      activityLog: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
      coverLetters: {
        select: { id: true, tone: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 3,
      },
    },
  });

  return NextResponse.json({ matches });
}