import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@ojp/db";
import Sidebar from "@/components/dashboard/Sidebar";
import DashboardHeader from "@/components/dashboard/DashboardHeader";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  if (!session.user.identityLockedAt) redirect("/onboarding/verify-phone");

  // Fetch subscription + credit balance for header
  const [subscription, profile] = await Promise.all([
    db.subscription.findUnique({
      where: { userId: session.user.id },
      include: { plan: true },
    }),
    db.userProfile.findUnique({
      where: { userId: session.user.id },
      select: { creditBalance: true, fullName: true },
    }),
  ]);

  const trialDaysLeft =
    subscription?.status === "TRIALING" && subscription.trialEnd
      ? Math.max(
          0,
          Math.ceil(
            (subscription.trialEnd.getTime() - Date.now()) /
              (1000 * 60 * 60 * 24)
          )
        )
      : null;

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar */}
      <Sidebar userRole={session.user.role} />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <DashboardHeader
          user={{
            name: profile?.fullName ?? session.user.email,
            email: session.user.email,
          }}
          subscription={{
            status: subscription?.status ?? "TRIALING",
            planName: subscription?.plan?.name ?? null,
            trialDaysLeft,
          }}
          creditBalance={profile?.creditBalance ?? 0}
        />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}