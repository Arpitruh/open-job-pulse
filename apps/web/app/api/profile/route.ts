import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@ojp/db";
import { z } from "zod";

const UpdateSchema = z.object({
  fullName: z.string().min(1).max(100),
  headline: z.string().max(200).optional(),
  minimumSalary: z.number().int().min(0).optional().nullable(),
  preferredMode: z.enum(["REMOTE", "HYBRID", "ON_SITE"]),
  parsedSkills: z.array(z.string()).default([]),
  targetTitles: z.array(z.string()).default([]),
  excludedTerms: z.array(z.string()).default([]),
});

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof UpdateSchema>;
  try {
    body = UpdateSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  await db.userProfile.upsert({
    where: { userId: session.user.id },
    update: {
      fullName: body.fullName,
      headline: body.headline,
      minimumSalary: body.minimumSalary,
      preferredMode: body.preferredMode,
      parsedSkills: body.parsedSkills,
      targetTitles: body.targetTitles,
      excludedTerms: body.excludedTerms,
    },
    create: {
      userId: session.user.id,
      fullName: body.fullName,
      headline: body.headline,
      minimumSalary: body.minimumSalary,
      preferredMode: body.preferredMode,
      parsedSkills: body.parsedSkills,
      targetTitles: body.targetTitles,
      excludedTerms: body.excludedTerms,
    },
  });

  return NextResponse.json({ success: true });
}