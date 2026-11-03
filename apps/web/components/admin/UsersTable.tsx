"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Search, ChevronLeft, ChevronRight, Ban, Gift, ExternalLink } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";

interface User {
  id: string; email: string; role: string; fullName: string | null;
  creditBalance: number; identityLockedAt: string | null; createdAt: string;
  subscription: { status: string; planName: string | null; trialEnd: string | null; currentPeriodEnd: string | null; stripeCustomerId: string; } | null;
}

const STATUS_COLORS: Record<string, any> = {
  ACTIVE: "success", TRIALING: "warning", PAST_DUE: "danger",
  CANCELLED: "secondary", INCOMPLETE: "secondary",
};

interface Props { users: User[]; total: number; page: number; pageSize: number; }

export default function UsersTable({ users, total, page, pageSize }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [grantingId, setGrantingId] = useState<string | null>(null);
  const [banningId, setBanningId] = useState<string | null>(null);
  const totalPages = Math.ceil(total / pageSize);

  function applyFilter(params: Record<string, string>) {
    const sp = new URLSearchParams(searchParams.toString());
    Object.entries(params).forEach(([k, v]) => { if (v) sp.set(k, v); else sp.delete(k); });
    sp.set("page", "1");
    router.push(`/admin/users?${sp.toString()}`);
  }

  async function handleGrantCredits(userId: string, email: string) {
    const amount = prompt(`Grant credits to ${email}\nHow many?`);
    if (!amount || isNaN(parseInt(amount))) return;
    setGrantingId(userId);
    try {
      const res = await fetch("/api/admin/credits/grant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, amount: parseInt(amount) }) });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Failed"); return; }
      toast.success(`Granted ${amount} credits to ${email}`);
      router.refresh();
    } catch { toast.error("Failed to grant credits"); }
    finally { setGrantingId(null); }
  }

  async function handleBanUser(userId: string, email: string) {
    const reason = prompt(`Ban ${email}\nReason? (trial_abuse / payment_fraud / other)`);
    if (!reason) return;
    if (!confirm(`Permanently ban ${email}?`)) return;
    setBanningId(userId);
    try {
      const res = await fetch("/api/admin/users/ban", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, reason }) });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Failed"); return; }
      toast.success(`User ${email} banned`);
      router.refresh();
    } catch { toast.error("Failed to ban user"); }
    finally { setBanningId(null); }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total.toLocaleString()} total users</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search email or name…" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") applyFilter({ q: search }); }} className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500" />
        </div>
        <select value={searchParams.get("status") ?? ""} onChange={(e) => applyFilter({ status: e.target.value })} className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white">
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="TRIALING">Trialing</option>
          <option value="PAST_DUE">Past Due</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 font-medium text-gray-500">User</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Status</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Plan</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Credits</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Joined</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-4">
                    <p className="font-medium text-gray-900">{user.fullName ?? "—"}{user.role === "ADMIN" && <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">Admin</span>}</p>
                    <p className="text-gray-500 text-xs mt-0.5">{user.email}</p>
                  </td>
                  <td className="px-5 py-4">
                    <Badge variant={STATUS_COLORS[user.subscription?.status ?? ""] ?? "secondary"}>{user.subscription?.status ?? "No sub"}</Badge>
                    {user.subscription?.status === "TRIALING" && user.subscription.trialEnd && (
                      <p className="text-xs text-gray-400 mt-1">Ends {formatDistanceToNow(new Date(user.subscription.trialEnd), { addSuffix: true })}</p>
                    )}
                  </td>
                  <td className="px-5 py-4 text-gray-700">{user.subscription?.planName ?? "—"}</td>
                  <td className="px-5 py-4"><span className={`font-medium ${user.creditBalance < 10 ? "text-red-600" : "text-gray-700"}`}>{user.creditBalance}</span></td>
                  <td className="px-5 py-4 text-gray-500 text-xs">{format(new Date(user.createdAt), "MMM d, yyyy")}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => handleGrantCredits(user.id, user.email)} disabled={grantingId === user.id} className="p-1.5 rounded-lg hover:bg-green-50 text-gray-400 hover:text-green-600 transition-colors" title="Grant credits"><Gift className="w-4 h-4" /></button>
                      {user.subscription?.stripeCustomerId && (
                        <a href={`https://dashboard.stripe.com/customers/${user.subscription.stripeCustomerId}`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors" title="View in Stripe"><ExternalLink className="w-4 h-4" /></a>
                      )}
                      <button onClick={() => handleBanUser(user.id, user.email)} disabled={banningId === user.id} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors" title="Ban user"><Ban className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between">
            <p className="text-xs text-gray-500">Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}</p>
            <div className="flex items-center gap-2">
              <button onClick={() => applyFilter({ page: String(page - 1) })} disabled={page === 1} className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-xs text-gray-600">{page} / {totalPages}</span>
              <button onClick={() => applyFilter({ page: String(page + 1) })} disabled={page === totalPages} className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}