import { db } from "@ojp/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import AdminListings from "@/components/admin/AdminListings";

export default async function AdminListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; flagged?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "ADMIN") redirect("/dashboard");

  const params = await searchParams;
  const page = parseInt(params.page ?? "1");
  const pageSize = 25;
  const flaggedOnly = params.flagged === "true";
  const where: any = {};
  if (flaggedOnly) where.isFlagged = true;

  const [listings, total] = await Promise.all([
    db.jobListing.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { discoveredAt: "desc" },
      select: {
        id: true,
        companyName: true,
        jobTitle: true,
        sourcePortal: true,
        workMode: true,
        isFlagged: true,
        flagReason: true,
        discoveredAt: true,
        _count: { select: { matches: true } },
      },
    }),
    db.jobListing.count({ where }),
  ]);

  const serialized = listings.map((l) => ({
    ...l,
    discoveredAt: l.discoveredAt.toISOString(),
    matchCount: l._count.matches,
  }));

  return (
    <AdminListings
      listings={serialized}
      total={total}
      page={page}
      pageSize={pageSize}
      flaggedOnly={flaggedOnly}
    />
  );
}