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

    // Fetch all active users with profiles
    const users = await db.userProfile.findMany({
      where: {
        user: {
          subscription: {
            status: { in: ["TRIALING", "ACTIVE"] },
          },
          identityLockedAt: { not: null },
        },
      },
      include: {
        user: {
          select: {
            id: true,
            subscription: {
              select: { status: true },
            },
          },
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

      // ── Stage 1b: Title matching ───────────────────────────────────────
      const { matches: titleMatches, matched: matchedTitles } =
        matchesTargetTitles(listing.jobTitle, profile.targetTitles);

      // Soft filter — don't skip, but apply score penalty for non-matching titles
      const titleBoost = titleMatches ? 0.2 : -0.1;
      // ── Stage 2: Vector similarity ────────────────────────────────────
      // Use pgvector cosine similarity
      // Only run if listing has a vector
      let similarityScore = 0.5; // Default if no vectors yet
      const scoreBreakdown: { matched: string[]; penalised: string[] } = {
        matched: matchedTitles,
        penalised,
      };

      try {
        if (profile.embeddingEngine === "LOCAL_MINILM") {
          const result = await db.$queryRaw<Array<{ similarity: number }>>`
            SELECT 1 - (
              lp.profile_vector_384 <=> jl.listing_vector_384
            ) AS similarity
            FROM user_profiles lp, job_listings jl
            WHERE lp.user_id = ${profile.userId}
              AND jl.id = ${jobListingId}
              AND lp.profile_vector_384 IS NOT NULL
              AND jl.listing_vector_384 IS NOT NULL
          `;
          if (result[0]) {
            similarityScore = Math.max(0, Math.min(1, result[0].similarity));
          }
        } else {
          const result = await db.$queryRaw<Array<{ similarity: number }>>`
            SELECT 1 - (
              lp.profile_vector_1536 <=> jl.listing_vector_1536
            ) AS similarity
            FROM user_profiles lp, job_listings jl
            WHERE lp.user_id = ${profile.userId}
              AND jl.id = ${jobListingId}
              AND lp.profile_vector_1536 IS NOT NULL
              AND jl.listing_vector_1536 IS NOT NULL
          `;
          if (result[0]) {
            similarityScore = Math.max(
              0,
              Math.min(1, similarityScore + titleBoost),
            );

            // Skip only if score is very low after penalty
            if (similarityScore < 0.15) continue;
          }
        }
      } catch {
        // Vectors not yet generated — use keyword-based fallback score
        const descLower = listing.descriptionRaw.toLowerCase();
        const skillMatches = (profile.parsedSkills ?? []).filter((skill) =>
          descLower.includes(skill.toLowerCase()),
        );
        scoreBreakdown.matched.push(...skillMatches);
        similarityScore = Math.min(
          1,
          0.3 +
            (skillMatches.length / Math.max(1, profile.parsedSkills.length)) *
              0.7,
        );
      }

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
