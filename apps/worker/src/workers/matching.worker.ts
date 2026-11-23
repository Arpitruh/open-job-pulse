import { Worker, type Job } from "bullmq";
import { redisConnection, dispatchQueue } from "@ojp/queue";
import { db } from "@ojp/db";
import type { MatchJobsJob } from "@ojp/queue";

// Hard constraint filters
function passesHardFilters(
  listing: any,
  profile: any,
): { passes: boolean; penalised: string[] } {
  const penalised: string[] = [];

  // Salary filter
  if (
    profile.minimumSalary &&
    listing.baseSalaryMax &&
    listing.baseSalaryMax < profile.minimumSalary
  ) {
    penalised.push(`Salary below minimum ($${profile.minimumSalary / 1000}k)`);
  }

  // Work mode filter
  if (profile.preferredMode === "REMOTE" && listing.workMode === "ON_SITE") {
    penalised.push("On-site role (remote required)");
  }

  // Exclusion keywords
  const descLower = listing.descriptionRaw.toLowerCase();
  const titleLower = listing.jobTitle.toLowerCase();
  const combined = `${descLower} ${titleLower}`;

  for (const term of profile.excludedTerms ?? []) {
    if (combined.includes(term.toLowerCase())) {
      penalised.push(`Excluded term: "${term}"`);
    }
  }

  return { passes: penalised.length === 0, penalised };
}

// Check if title matches target patterns
function matchesTargetTitles(
  jobTitle: string,
  targetTitles: string[],
): { matches: boolean; matched: string[] } {
  if (!targetTitles || targetTitles.length === 0) {
    return { matches: true, matched: [] };
  }

  const matched: string[] = [];
  const titleLower = jobTitle.toLowerCase();

  for (const pattern of targetTitles) {
    const cleaned = pattern
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".")
      .toLowerCase();
    try {
      const regex = new RegExp(cleaned, "i");
      if (regex.test(titleLower)) {
        matched.push(pattern);
      }
    } catch {
      if (titleLower.includes(pattern.replace(/\*/g, "").toLowerCase())) {
        matched.push(pattern);
      }
    }
  }

  return { matches: matched.length > 0, matched };
}

export const matchingWorker = new Worker(
  "matching",
  async (job: Job<MatchJobsJob>) => {
    const { jobListingId } = job.data;

    // Fetch the listing
    const listing = await db.jobListing.findUnique({
      where: { id: jobListingId },
    });

    if (!listing || listing.isFlagged) return;

    // Include free accounts with no subscription record. Existing paid users
    // remain eligible only while their subscription is active or trialing.
    const users = await db.userProfile.findMany({
      where: {
        user: {
          OR: [
            { subscription: null },
            { subscription: { status: { in: ["TRIALING", "ACTIVE"] } } },
          ],
        },
      },
    });

    let matchesCreated = 0;

    for (const profile of users) {
      // Skip if already matched
      const existing = await db.jobMatch.findFirst({
        where: { userId: profile.userId, jobListingId },
      });
      if (existing) continue;

      // ── Stage 1: Hard filters ──────────────────────────────────────────
      const { passes, penalised } = passesHardFilters(listing, profile);

      if (!passes) continue;

      // ── Stage 1b: Title matching ───────────────────────────────────────
      const { matches: titleMatches, matched: matchedTitles } =
        matchesTargetTitles(listing.jobTitle, profile.targetTitles);

      // Soft filter — don't skip, but apply score penalty for non-matching titles
      const titleBoost = titleMatches ? 0.2 : -0.1;
      // ── Stage 2: Vector similarity ────────────────────────────────────
      // Prisma's unmapped fields use quoted camelCase SQL column names.
      // Missing vectors fall back to transparent keyword overlap rather than
      // claiming an arbitrary 50% semantic similarity.
      const scoreBreakdown: { matched: string[]; penalised: string[] } = {
        matched: [...matchedTitles],
        penalised,
      };
      let semanticScore: number | null = null;
      try {
        const rows = profile.embeddingEngine === "LOCAL_MINILM"
          ? await db.$queryRaw<Array<{ similarity: number | null }>>`
              SELECT 1 - (p."profileVector384" <=> j."listingVector384") AS similarity
              FROM user_profiles p CROSS JOIN job_listings j
              WHERE p."userId" = ${profile.userId} AND j.id = ${jobListingId}
                AND p."profileVector384" IS NOT NULL
                AND j."listingVector384" IS NOT NULL
            `
          : await db.$queryRaw<Array<{ similarity: number | null }>>`
              SELECT 1 - (p."profileVector1536" <=> j."listingVector1536") AS similarity
              FROM user_profiles p CROSS JOIN job_listings j
              WHERE p."userId" = ${profile.userId} AND j.id = ${jobListingId}
                AND p."profileVector1536" IS NOT NULL
                AND j."listingVector1536" IS NOT NULL
            `;
        if (rows[0]?.similarity != null) semanticScore = Number(rows[0].similarity);
      } catch (error) {
        console.warn(`[Matching] Vector lookup unavailable for ${profile.userId}:`, error);
      }

      let similarityScore: number;
      if (semanticScore === null || !Number.isFinite(semanticScore)) {
        const text = `${listing.jobTitle} ${listing.descriptionRaw}`.toLowerCase();
        const skills = profile.parsedSkills ?? [];
        const matchedSkills = skills.filter((skill) => text.includes(skill.toLowerCase()));
        scoreBreakdown.matched.push(...matchedSkills);
        // With no vectors and no skills, do not invent a confident match.
        if (!skills.length && !matchedTitles.length) continue;
        similarityScore = skills.length ? matchedSkills.length / skills.length : 0;
      } else {
        similarityScore = semanticScore;
      }
      similarityScore = Math.max(0, Math.min(1, similarityScore + titleBoost));
      if (similarityScore < 0.15) continue;

      // ── Create match record ────────────────────────────────────────────
      // Get workspace
      const workspace = await db.workspaceMember.findFirst({
        where: { userId: profile.userId },
        select: { workspaceId: true },
      });

      if (!workspace) continue;

      const match = await db.jobMatch.create({
        data: {
          workspaceId: workspace.workspaceId,
          userId: profile.userId,
          jobListingId,
          similarityScore,
          scoreBreakdown,
          status: "DISCOVERED",
          activityLog: {
            create: {
              type: "status_change",
              payload: {
                from: null,
                to: "DISCOVERED",
                changedAt: new Date().toISOString(),
                autoMatched: true,
              },
            },
          },
        },
      });

      matchesCreated++;

      // ── Enqueue dispatch ───────────────────────────────────────────────
      const profileWithTelegram = await db.userProfile.findUnique({
        where: { userId: profile.userId },
        select: { telegramChatId: true, emailDigest: true },
      });

      if (profileWithTelegram?.telegramChatId) {
        await dispatchQueue.add(
          "send-telegram",
          {
            userId: profile.userId,
            jobMatchId: match.id,
            chatId: profileWithTelegram.telegramChatId,
          },
          { jobId: `telegram-${match.id}`, attempts: 3 },
        );
      }

      if (profileWithTelegram?.emailDigest === "instant") {
        await dispatchQueue.add(
          "send-email-digest",
          { userId: profile.userId, digestType: "instant" },
          { jobId: `email-instant-${match.id}`, attempts: 3 },
        );
      }
    }

    console.log(
      `[Matching] ${listing.jobTitle} @ ${listing.companyName}: ${matchesCreated} matches`,
    );
  },
  {
    connection: redisConnection,
    concurrency: 10,
  },
);

matchingWorker.on("completed", (job) => {
  console.log(`[Matching Worker] ✓ ${job.id}`);
});

matchingWorker.on("failed", (job, err) => {
  console.error(`[Matching Worker] ✗ ${job?.id}:`, err.message);
});
