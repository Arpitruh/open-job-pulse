import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@ojp/db";
import { checkAndDeductCredits } from "@ojp/ai";
import { aiQueue } from "@ojp/queue";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // ── Fetch profile ─────────────────────────────────────────────────────────
  const profile = await db.userProfile.findUnique({
    where: { userId },
    select: {
      aiApiKey: true,
      parsedSkills: true,
      targetTitles: true,
    },
  });

  if (!profile?.aiApiKey) {
    return NextResponse.json(
      { error: "No API key configured." },
      { status: 400 }
    );
  }

  // ── Count pipeline listings ───────────────────────────────────────────────
  const listingCount = await db.jobMatch.count({
    where: {
      userId,
      status: { in: ["DISCOVERED", "APPLIED", "INTERVIEWING"] },
    },
  });

  if (listingCount < 5) {
    return NextResponse.json(
      {
        error: `Need at least 5 active job matches for a meaningful analysis. You have ${listingCount}.`,
      },
      { status: 400 }
    );
  }

  // ── Check for in-progress report ─────────────────────────────────────────
  const inProgress = await db.skillsGapReport.findFirst({
    where: {
      userId,
      status: { in: ["QUEUED", "PROCESSING"] },
    },
  });

  if (inProgress) {
    return NextResponse.json(
      { error: "Analysis already running", reportId: inProgress.id },
      { status: 409 }
    );
  }

  // ── Check if refresh or first run ────────────────────────────────────────
  const lastReport = await db.skillsGapReport.findFirst({
    where: { userId, status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
  });

  const feature = lastReport ? "SKILLS_GAP_REFRESH" : "SKILLS_GAP";
  const cost = lastReport ? 10 : 20;

  const creditResult = await checkAndDeductCredits(
    userId,
    feature,
    "Skills gap analysis"
  );

  if (!creditResult.success) {
    return NextResponse.json({ error: creditResult.error }, { status: 402 });
  }

  // ── Create report record ──────────────────────────────────────────────────
  const report = await db.skillsGapReport.create({
    data: {
      userId,
      status: "QUEUED",
      creditsCharged: cost,
      triggerType: "manual",
    },
  });

  // ── Enqueue BullMQ job ────────────────────────────────────────────────────
  await aiQueue.add(
    "skills-gap",
    {
      userId,
      reportId: report.id,
      encryptedApiKey: profile.aiApiKey,
      aiProvider: "auto",
      triggerType: "manual",
    },
    { jobId: `skills-gap-${report.id}`, attempts: 2 }
  );

  return NextResponse.json({
    success: true,
    reportId: report.id,
    message: `Analyzing ${listingCount} job listings — this takes about 30 seconds`,
    creditsCharged: cost,
    creditsRemaining: creditResult.balance,
  });
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Return latest completed + any in-progress
  const [latest, inProgress] = await Promise.all([
    db.skillsGapReport.findFirst({
      where: { userId: session.user.id, status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
    }),
    db.skillsGapReport.findFirst({
      where: {
        userId: session.user.id,
        status: { in: ["QUEUED", "PROCESSING"] },
      },
    }),
  ]);

  return NextResponse.json({ latest, inProgress });
}