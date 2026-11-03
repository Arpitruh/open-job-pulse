import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@ojp/db";
import { redirect } from "next/navigation";
import ProfileSettings from "@/components/settings/ProfileSettings";

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const profile = await db.userProfile.findUnique({
    where: { userId: session.user.id },
    select: {
      fullName: true,
      headline: true,
      parsedSkills: true,
      targetTitles: true,
      excludedTerms: true,
      minimumSalary: true,
      preferredMode: true,
      rawResumeText: true,
    },
  });

  return (
    <ProfileSettings
      userId={session.user.id}
      email={session.user.email}
      profile={profile ?? null}
    />
  );
}