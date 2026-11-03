export interface CoverLetterParams {
  resumeText: string;
  jobTitle: string;
  companyName: string;
  jobDescription: string;
  tone: string;
  length: string;
  openingStyle: string;
}

const wordTargets: Record<string, string> = {
  short: "150-200 words",
  medium: "280-320 words",
  long: "450-500 words",
};

const openingGuides: Record<string, string> = {
  achievement:
    "Open with a specific quantified achievement from your resume that directly relates to this role",
  excitement:
    "Open with genuine enthusiasm for the specific company and role — reference something real about them",
  connection:
    "Open by referencing a shared connection, mutual context, or how you discovered the role",
};

export function buildCoverLetterPrompt(params: CoverLetterParams) {
  return {
    system: `You are an expert career coach and professional writer specializing in tech industry job applications. 
You write cover letters that are specific, authentic, and compelling — never generic.
Target length: ${wordTargets[params.length] ?? "280-320 words"}.
Tone: ${params.tone}.`,

    user: `Write a cover letter for this job application.

CANDIDATE PROFILE:
${params.resumeText}

TARGET ROLE:
Company: ${params.companyName}
Title: ${params.jobTitle}
Job Description:
${params.jobDescription.slice(0, 3000)}

INSTRUCTIONS:
- Opening style: ${openingGuides[params.openingStyle] ?? openingGuides.achievement}
- Reference 2-3 specific skills or experiences from the resume that directly match the job description
- Mention the company name naturally, not robotically
- End with a confident, non-desperate closing
- Do NOT invent experience not present in the resume
- Do NOT use generic openers like "I am writing to express my interest"
- Do NOT include subject lines or headers — letter body only
- Output ONLY the cover letter text`,
  };
}