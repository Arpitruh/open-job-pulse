import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@ojp/db";
import { redirect } from "next/navigation";
import AiKeysSettings from "@/components/settings/AiKeysSettings";

export default async function AiKeysPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const profile = await db.userProfile.findUnique({
    where: { userId: session.user.id },
    select: {
      aiApiKey: true,
      aiProvider: true,
      creditBalance: true,
      creditsLifetime: true,
    },
  });

  return (
    <AiKeysSettings
      hasKey={!!profile?.aiApiKey}
      provider={profile?.aiProvider ?? null}
      creditBalance={profile?.creditBalance ?? 0}
      creditsLifetime={profile?.creditsLifetime ?? 0}
    />
  );
}