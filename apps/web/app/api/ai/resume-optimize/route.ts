import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@ojp/db";
import { z } from "zod";
import { checkAndDeductCredits, refundCredits } from "@ojp/ai";
import { aiQueue } from "@ojp/queue";

const Schema = z.object({
  matchId: z.string(),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  let body: z.infer<typeof Schema>;
  try {
    body = Schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // ── Fetch profile + match ─────────────────────────────────────────────────
  const [profile, match] = await Promise.all([
    db.userProfile.findUnique({
      where: { userId },
      select: { aiApiKey: true, rawResumeText: true, parsedSkills: true },
    }),
    db.jobMatch.findFirst({
      where: { id: body.matchId, userId },
      include: {
        jobListing: {
          select: { companyName: true, jobTitle: true, descriptionRaw: true },
        },
        optimizationRuns: {
          where: { status: { not: "FAILED" } },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    }),
  ]);

  if (!profile?.aiApiKey) {
    return NextResponse.json(
      { error: "No API key configured." },
      { status: 400 }
    );
  }

  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  // ── Check no run already in progress ─────────────────────────────────────
  const inProgress = match.optimizationRuns[0];
  if (inProgress?.status === "QUEUED" || inProgress?.status === "PROCESSING") {
    return NextResponse.json(
      { error: "Optimization already running", runId: inProgress.id },
      { status: 409 }
    );
  }

  // ── Credit deduction ──────────────────────────────────────────────────────
  const isRerun = !!inProgress;
  const feature = isRerun ? "RESUME_RERUN" : "RESUME_OPTIMIZE";
  const cost = isRerun ? 8 : 15;

  const creditResult = await checkAndDeductCredits(
    userId,
    feature,
    `Resume optimization for ${match.jobListing.companyName} — ${match.jobListing.jobTitle}`
  );

  if (!creditResult.success) {
    return NextResponse.json({ error: creditResult.error }, { status: 402 });
  }

  // ── Create run record ─────────────────────────────────────────────────────
  const run = await db.resumeOptimizationRun.create({
    data: {
      userId,
      jobMatchId: body.matchId,
      status: "QUEUED",
      creditsCharged: cost,
    },
  });

  // ── Enqueue BullMQ job ────────────────────────────────────────────────────
  await aiQueue.add(
    "resume-optimize",
    {
      userId,
      jobMatchId: body.matchId,
      runId: run.id,
      encryptedApiKey: profile.aiApiKey,
      aiProvider: "auto",
    },
    { jobId: `resume-optimize-${run.id}`, attempts: 2 }
  );

  return NextResponse.json({
    success: true,
    runId: run.id,
    message: "Optimization queued — we'll notify you when it's ready",
    creditsCharged: cost,
    creditsRemaining: creditResult.balance,
  });
}

// ── GET — fetch latest run for a match ───────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const matchId = req.nextUrl.searchParams.get("matchId");
  if (!matchId) {
    return NextResponse.json({ error: "matchId required" }, { status: 400 });
  }

  const run = await db.resumeOptimizationRun.findFirst({
    where: { userId: session.user.id, jobMatchId: matchId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ run });
}