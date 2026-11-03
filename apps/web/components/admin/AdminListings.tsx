"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Flag, Trash2, ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";

interface Listing {
  id: string;
  companyName: string;
  jobTitle: string;
  sourcePortal: string;
  workMode: string;
  isFlagged: boolean;
  flagReason: string | null;
  discoveredAt: string;
  matchCount: number;
}

interface Props {
  listings: Listing[];
  total: number;
  page: number;
  pageSize: number;
  flaggedOnly: boolean;
}

export default function AdminListings({
  listings,
  total,
  page,
  pageSize,
  flaggedOnly,
}: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const totalPages = Math.ceil(total / pageSize);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === listings.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(listings.map((l) => l.id)));
    }
  }

  async function handleFlag(ids: string[], reason: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/listings/flag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, reason }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${ids.length} listing(s) flagged`);
      setSelected(new Set());
      router.refresh();
    } catch {
      toast.error("Failed to flag listings");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(ids: string[]) {
    if (!confirm(`Delete ${ids.length} listing(s)? This cannot be undone.`))
      return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/listings/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${ids.length} listing(s) deleted`);
      setSelected(new Set());
      router.refresh();
    } catch {
      toast.error("Failed to delete listings");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Job Listings</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {total.toLocaleString()} listings
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <>
              <button
                onClick={() =>
                  handleFlag(
                    Array.from(selected),
                    prompt("Flag reason?") ?? "spam"
                  )
                }
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-sm font-medium hover:bg-amber-100 transition-colors"
              >
                <Flag className="w-3.5 h-3.5" />
                Flag ({selected.size})
              </button>
              <button
                onClick={() => handleDelete(Array.from(selected))}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete ({selected.size})
              </button>
            </>
          )}
          <button
            onClick={() =>
              router.push(
                `/admin/listings${flaggedOnly ? "" : "?flagged=true"}`
              )
            }
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
              flaggedOnly
                ? "bg-amber-50 border-amber-200 text-amber-700"
                : "bg-white border-gray-200 text-gray-600"
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            {flaggedOnly ? "Show All" : "Flagged Only"}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-5 py-3 w-10">
                <input
                  type="checkbox"
                  checked={selected.size === listings.length && listings.length > 0}
                  onChange={toggleAll}
                  className="rounded"
                />
              </th>
              <th className="text-left px-5 py-3 font-medium text-gray-500">
                Listing
              </th>
              <th className="text-left px-5 py-3 font-medium text-gray-500">
                Source
              </th>
              <th className="text-left px-5 py-3 font-medium text-gray-500">
                Matches
              </th>
              <th className="text-left px-5 py-3 font-medium text-gray-500">
                Discovered
              </th>
              <th className="text-left px-5 py-3 font-medium text-gray-500">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {listings.map((listing) => (
              <tr
                key={listing.id}
                className={`hover:bg-gray-50 transition-colors ${
                  listing.isFlagged ? "bg-amber-50" : ""
                }`}
              >
                <td className="px-5 py-4">
                  <input
                    type="checkbox"
                    checked={selected.has(listing.id)}
                    onChange={() => toggleSelect(listing.id)}
                    className="rounded"
                  />
                </td>
                <td className="px-5 py-4">
                  <p className="font-medium text-gray-900">
                    {listing.jobTitle}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {listing.companyName} · {listing.workMode.replace("_", " ")}
                  </p>
                </td>
                <td className="px-5 py-4 text-gray-500 text-xs">
                  {listing.sourcePortal}
                </td>
                <td className="px-5 py-4 font-medium text-gray-700">
                  {listing.matchCount}
                </td>
                <td className="px-5 py-4 text-gray-400 text-xs">
                  {formatDistanceToNow(new Date(listing.discoveredAt), {
                    addSuffix: true,
                  })}
                </td>
                <td className="px-5 py-4">
                  {listing.isFlagged ? (
                    <Badge variant="warning">
                      {listing.flagReason ?? "Flagged"}
                    </Badge>
                  ) : (
                    <Badge variant="success">Active</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of{" "}
              {total}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  router.push(
                    `/admin/listings?page=${page - 1}${
                      flaggedOnly ? "&flagged=true" : ""
                    }`
                  )
                }
                disabled={page === 1}
                className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-gray-600">
                {page} / {totalPages}
              </span>
              <button
                onClick={() =>
                  router.push(
                    `/admin/listings?page=${page + 1}${
                      flaggedOnly ? "&flagged=true" : ""
                    }`
                  )
                }
                disabled={page === totalPages}
                className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}