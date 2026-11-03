export interface ResumeOptimizerParams {
  resumeText: string;
  jobTitle: string;
  companyName: string;
  jobDescription: string;
}

export function buildResumeOptimizerPrompt(params: ResumeOptimizerParams) {
  return {
    system: `You are an expert ATS optimization specialist and career coach. 
Analyze resumes against job descriptions and provide actionable, specific improvement suggestions.
Always respond with valid JSON only — no markdown, no explanation outside the JSON.`,

    user: `Analyze this resume against the job description and return a JSON report.

RESUME:
${params.resumeText}

JOB:
Company: ${params.companyName}
Title: ${params.jobTitle}
Description:
${params.jobDescription.slice(0, 3000)}

Return this exact JSON structure:
{
  "overallScore": <0-100 integer>,
  "atsScore": <0-100 integer>,
  "sections": {
    "keywords": {
      "present": ["skill1", "skill2"],
      "missing": ["skill3", "skill4"],
      "partialMatch": ["your term ↔ jd term"]
    },
    "bulletSuggestions": [
      {
        "original": "exact bullet from resume",
        "suggested": "improved version",
        "reason": "why this change helps"
      }
    ],
    "toneAnalysis": {
      "score": <0-100>,
      "issues": ["issue1", "issue2"]
    },
    "lengthAnalysis": {
      "currentWords": <number>,
      "recommendation": "brief recommendation"
    }
  }
}`,
  };
}