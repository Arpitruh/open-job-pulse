// ─── Ingestion Jobs ──────────────────────────────────────────────
export interface RunScraperJob {
  scraperConfigId: string;
  workspaceId: string;
  adapterType: string;
  sourceUrl: string;
}

// ─── Matching Jobs ───────────────────────────────────────────────
export interface MatchJobsJob {
  jobListingId: string;
}

// ─── Dispatch Jobs ───────────────────────────────────────────────
export interface SendTelegramJob {
  userId: string;
  jobMatchId: string;
  chatId: string;
}

export interface SendEmailDigestJob {
  userId: string;
  digestType: "instant" | "daily" | "weekly";
}

export interface SendWebhookJob {
  userId: string;
  webhookUrl: string;
  jobMatchId: string;
}

// ─── AI Jobs ─────────────────────────────────────────────────────
export interface ResumeOptimizeJob {
  userId: string;
  jobMatchId: string;
  runId: string;
  encryptedApiKey: string;
  aiProvider: string;
}

export interface SkillsGapJob {
  userId: string;
  reportId: string;
  encryptedApiKey: string;
  aiProvider: string;
  triggerType: "manual" | "weekly_auto";
}

// ─── Scheduler Jobs ──────────────────────────────────────────────
export interface WeeklySkillsGapJob {
  userIds: string[];
}

export interface TrialExpiryReminderJob {
  userId: string;
  email: string;
  daysLeft: number;
}