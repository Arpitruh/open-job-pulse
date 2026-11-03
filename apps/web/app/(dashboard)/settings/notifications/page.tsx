import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@ojp/db";
import { redirect } from "next/navigation";
import NotificationSettings from "@/components/settings/NotificationSettings";

export default async function NotificationsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const profile = await db.userProfile.findUnique({
    where: { userId: session.user.id },
    select: { telegramChatId: true, emailDigest: true },
  });

  return (
    <NotificationSettings
      telegramChatId={profile?.telegramChatId ?? null}
      emailDigest={profile?.emailDigest ?? "daily"}
    />
  );
}