import { db } from "@ojp/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import UsersTable from "@/components/admin/UsersTable";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; q?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "ADMIN") redirect("/dashboard");

  const params = await searchParams;
  const page = parseInt(params.page ?? "1");
  const pageSize = 20;
  const skip = (page - 1) * pageSize;
  const statusFilter = params.status;
  const query = params.q;
  const where: any = {};
  if (query) {
    where.OR = [
      { email: { contains: query, mode: "insensitive" } },
      { profile: { fullName: { contains: query, mode: "insensitive" } } },
    ];
  }
  if (statusFilter) {
    where.subscription = { status: statusFilter };
  }

  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      include: {
        profile: {
          select: {
            fullName: true,
            creditBalance: true,
          },
        },
        subscription: {
          include: { plan: true },
        },
      },
    }),
    db.user.count({ where }),
  ]);

  const serialized = users.map((u) => ({
    id: u.id,
    email: u.email,
    role: u.role,
    fullName: u.profile?.fullName ?? null,
    creditBalance: u.profile?.creditBalance ?? 0,
    identityLockedAt: u.identityLockedAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
    subscription: u.subscription
      ? {
          status: u.subscription.status,
          planName: u.subscription.plan?.name ?? null,
          trialEnd: u.subscription.trialEnd?.toISOString() ?? null,
          currentPeriodEnd: u.subscription.currentPeriodEnd?.toISOString() ?? null,
          stripeCustomerId: u.subscription.stripeCustomerId,
        }
      : null,
  }));

  return (
    <UsersTable
      users={serialized}
      total={total}
      page={page}
      pageSize={pageSize}
    />
  );
}