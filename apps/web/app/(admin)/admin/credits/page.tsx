import { db } from "@ojp/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { format } from "date-fns";

export default async function AdminCreditsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "ADMIN") redirect("/dashboard");

  const [recentTransactions, featureBreakdown, totalDeducted, totalGranted] =
    await Promise.all([
      db.creditTransaction.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          user: { select: { email: true } },
        },
      }),
      db.creditTransaction.groupBy({
        by: ["type"],
        _sum: { amount: true },
        _count: { id: true },
      }),
      db.creditTransaction.aggregate({
        where: { type: "FEATURE_DEDUCT" },
        _sum: { amount: true },
      }),
      db.creditTransaction.aggregate({
        where: { type: { in: ["TRIAL_GRANT", "PLAN_GRANT", "TOPUP_PURCHASE", "ADMIN_GRANT"] } },
        _sum: { amount: true },
      }),
    ]);

  const TYPE_COLORS: Record<string, string> = {
    TRIAL_GRANT: "bg-blue-100 text-blue-700",
    PLAN_GRANT: "bg-green-100 text-green-700",
    TOPUP_PURCHASE: "bg-indigo-100 text-indigo-700",
    FEATURE_DEDUCT: "bg-red-100 text-red-700",
    ADMIN_GRANT: "bg-purple-100 text-purple-700",
    REFUND: "bg-amber-100 text-amber-700",
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Credit Usage</h1>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {featureBreakdown.map((fb) => (
          <div
            key={fb.type}
            className="bg-white rounded-xl border border-gray-200 p-4"
          >
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                TYPE_COLORS[fb.type] ?? "bg-gray-100 text-gray-600"
              }`}
            >
              {fb.type.replace("_", " ")}
            </span>
            <p className="text-xl font-bold text-gray-900 mt-2">
              {Math.abs(fb._sum.amount ?? 0).toLocaleString()}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {fb._count.id} transactions
            </p>
          </div>
        ))}
      </div>

      {/* Recent transactions */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-sm">
            Recent Transactions
          </h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-5 py-3 font-medium text-gray-500">
                User
              </th>
              <th className="text-left px-5 py-3 font-medium text-gray-500">
                Type
              </th>
              <th className="text-left px-5 py-3 font-medium text-gray-500">
                Amount
              </th>
              <th className="text-left px-5 py-3 font-medium text-gray-500">
                Balance
              </th>
              <th className="text-left px-5 py-3 font-medium text-gray-500">
                Description
              </th>
              <th className="text-left px-5 py-3 font-medium text-gray-500">
                Date
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {recentTransactions.map((tx) => (
              <tr key={tx.id} className="hover:bg-gray-50">
                <td className="px-5 py-3 text-gray-600 text-xs">
                  {tx.user.email}
                </td>
                <td className="px-5 py-3">
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      TYPE_COLORS[tx.type] ?? "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {tx.type.replace("_", " ")}
                  </span>
                </td>
                <td
                  className={`px-5 py-3 font-medium ${
                    tx.amount < 0 ? "text-red-600" : "text-green-600"
                  }`}
                >
                  {tx.amount > 0 ? "+" : ""}
                  {tx.amount}
                </td>
                <td className="px-5 py-3 text-gray-700">{tx.balance}</td>
                <td className="px-5 py-3 text-gray-500 text-xs max-w-xs truncate">
                  {tx.description}
                </td>
                <td className="px-5 py-3 text-gray-400 text-xs">
                  {format(tx.createdAt, "MMM d, HH:mm")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}