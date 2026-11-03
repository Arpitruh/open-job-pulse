import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@ojp/db";

// Tech skill keywords for extraction
const TECH_SKILLS = [
  "javascript","typescript","python","go","rust","java","kotlin","swift","c++","c#",
  "react","next.js","vue","angular","svelte","node.js","express","fastapi","django",
  "postgresql","mysql","mongodb","redis","elasticsearch","cassandra",
  "aws","gcp","azure","docker","kubernetes","terraform","ansible","helm",
  "graphql","rest","grpc","kafka","rabbitmq","nats",
  "git","ci/cd","github actions","jenkins","argocd",
  "machine learning","pytorch","tensorflow","langchain","openai",
  "linux","bash","nginx","traefik",
];

function extractSkills(text: string): string[] {
  const lower = text.toLowerCase();
  return TECH_SKILLS.filter((skill) => lower.includes(skill.toLowerCase()));
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("resume") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const maxSize = 5 * 1024 * 1024; // 5MB
  if (file.size > maxSize) {
    return NextResponse.json(
      { error: "File too large. Max 5MB." },
      { status: 400 }
    );
  }

  let rawText = "";

  try {
    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "txt" || ext === "md") {
      rawText = await file.text();
    } else if (ext === "pdf") {
      // Use unpdf for PDF parsing
      const { extractText } = await import("unpdf");
      const buffer = await file.arrayBuffer();
      const { text } = await extractText(new Uint8Array(buffer), {
        mergePages: true,
      });
      rawText = text;
    } else if (ext === "docx") {
      // Basic DOCX text extraction
      const buffer = await file.arrayBuffer();
      const { default: JSZip } = await import("jszip");
      const zip = await JSZip.loadAsync(buffer);
      const docXml = await zip.file("word/document.xml")?.async("text");
      rawText = docXml
        ?.replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim() ?? "";
    } else {
      return NextResponse.json(
        { error: "Unsupported file type. Use PDF, DOCX, or Markdown." },
        { status: 400 }
      );
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: `Failed to parse file: ${err.message}` },
      { status: 500 }
    );
  }

  const parsedSkills = extractSkills(rawText);

  await db.userProfile.update({
    where: { userId: session.user.id },
    data: {
      rawResumeText: rawText.slice(0, 50_000),
      parsedSkills,
    },
  });

  return NextResponse.json({
    success: true,
    parsedSkills,
    charCount: rawText.length,
  });
}