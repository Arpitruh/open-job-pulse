export interface SkillsGapParams {
  resumeSkills: string[];
  jobListingsSummary: string;
  targetTitles: string[];
}

export function buildSkillsGapPrompt(params: SkillsGapParams) {
  return {
    system: `You are a senior technical career advisor with deep knowledge of the software engineering job market.
Analyze skill demand patterns and provide strategic, actionable career guidance.
Always respond with valid JSON only — no markdown, no explanation outside the JSON.`,

    user: `Analyze the candidate's skills against their target job market and identify gaps.

CANDIDATE SKILLS:
${params.resumeSkills.join(", ")}

TARGET TITLES:
${params.targetTitles.join(", ")}

JOB MARKET ANALYSIS (aggregated from ${params.jobListingsSummary.split("\n").length} listings):
${params.jobListingsSummary.slice(0, 4000)}

Return this exact JSON structure:
{
  "yourStrengths": [
    { "skill": "skill name", "presentIn": "X% of your target roles" }
  ],
  "criticalGaps": [
    {
      "skill": "skill name",
      "demandedIn": "X% of your target roles",
      "avgSalaryPremium": "+$Xk estimated",
      "priority": "HIGH",
      "learningResources": [
        { "title": "resource title", "url": "https://...", "free": true }
      ]
    }
  ],
  "niceToHave": [
    { "skill": "skill name", "demandedIn": "X% of your target roles", "priority": "LOW" }
  ],
  "narrativeInsight": "2-3 sentence strategic summary of the most important actions"
}`,
  };
}