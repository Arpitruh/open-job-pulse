import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@ojp/db";
import { z } from "zod";
import {
  streamAi,
  checkAndDeductCredits,
  refundCredits,
  buildCoverLetterPrompt,
  decrypt,
} from "@ojp/ai";

const Schema = z.object({
  matchId: z.string(),
  tone: z.enum(["professional", "enthusiastic", "concise", "story-driven"]),
  length: z.enum(["short", "medium", "long"]),
  openingStyle: z.enum(["achievement", "excitement", "connection"]),
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

  // ── Fetch profile + match + job listing ───────────────────────────────────
  const [profile, match] = await Promise.all([
    db.userProfile.findUnique({
      where: { userId },
      select: {
        aiApiKey: true,
        aiProvider: true,
        rawResumeText: true,
        parsedSkills: true,
      },
    }),
    db.jobMatch.findFirst({
      where: { id: body.matchId, userId },
      include: {
        jobListing: {
          select: {
            companyName: true,
            jobTitle: true,
            descriptionRaw: true,
          },
        },
        coverLetters: { select: { id: true }, take: 1 },
      },
    }),
  ]);

  if (!profile?.aiApiKey) {
    return NextResponse.json(
      { error: "No API key configured. Add your OpenAI or Anthropic key in Settings → AI Keys." },
      { status: 400 }
    );
  }

  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  // ── Credit check & deduction ──────────────────────────────────────────────
  const isRegenerate = match.coverLetters.length > 0;
  const feature = isRegenerate ? "COVER_LETTER_REGENERATE" : "COVER_LETTER_GENERATE";
  const cost = isRegenerate ? 5 : 10;

  const creditResult = await checkAndDeductCredits(
    userId,
    feature,
    `Cover letter for ${match.jobListing.companyName} — ${match.jobListing.jobTitle}`
  );

  if (!creditResult.success) {
    return NextResponse.json(
      { error: creditResult.error },
      { status: 402 }
    );
  }

  // ── Build prompt ──────────────────────────────────────────────────────────
  const resumeText =
    profile.rawResumeText ??
    `Skills: ${profile.parsedSkills.join(", ")}`;

  const { system, user } = buildCoverLetterPrompt({
    resumeText,
    jobTitle: match.jobListing.jobTitle,
    companyName: match.jobListing.companyName,
    jobDescription: match.jobListing.descriptionRaw,
    tone: body.tone,
    length: body.length,
    openingStyle: body.openingStyle,
  });

  // ── Stream response ───────────────────────────────────────────────────────
  const encoder = new TextEncoder();
  let fullContent = "";
  let tokensUsed = 0;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const token of streamAi(
          profile.aiApiKey!,
          [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          800
        )) {
          fullContent += token;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ token })}\n\n`)
          );
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();

        // ── Save to DB after stream completes ────────────────────────────
        await db.coverLetter.upsert({
          where: {
            // Use a composite approach — find existing for this match
            id: match.coverLetters[0]?.id ?? "new",
          },
          update: {
            content: fullContent,
            tone: body.tone,
            length: body.length,
            openingStyle: body.openingStyle,
            promptVersion: "cover-letter-v1",
            aiModel: "auto-detected",
            creditsCharged: cost,
            versions: {
              push: {
                content: fullContent,
                generatedAt: new Date().toISOString(),
                promptVersion: "cover-letter-v1",
              },
            } as any,
          },
          create: {
            userId,
            jobMatchId: body.matchId,
            content: fullContent,
            tone: body.tone,
            length: body.length,
            openingStyle: body.openingStyle,
            promptVersion: "cover-letter-v1",
            aiModel: "auto-detected",
            creditsCharged: cost,
            versions: [
              {
                content: fullContent,
                generatedAt: new Date().toISOString(),
                promptVersion: "cover-letter-v1",
              },
            ],
          },
        });
      } catch (err: any) {
        console.error("[Cover Letter] Stream error:", err.message);
        // Refund credits on failure
        await refundCredits(userId, cost, "Cover letter generation failed — refund");
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: "Generation failed" })}\n\n`
          )
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}