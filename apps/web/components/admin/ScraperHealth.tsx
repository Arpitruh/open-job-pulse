"use client";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, XCircle, AlertTriangle, Clock, Play, Power, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useRouter } from "next/navigation";

interface Scraper {
  id: string; label: string; adapterType: string; sourceUrl: string;
  cronSchedule: string; enabled: boolean; lastRunAt: string | null;
  lastRunStatus: string | null; lastRunError: string | null;
  jobsIngested: number; consecutiveFails: number; workspaceName: string; requestsPerMin: number;
}

function StatusIcon({ status, fails }: { status: string | null; fails: number }) {
  if (fails >= 3) return <XCircle className="w-4 h-4 text-red-500" />;
  if (status === "success") return <CheckCircle2 className="w-4 h-4 text-green-500" />;
  if (status === "running") return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />;
  if (status === "failed") return <AlertTriangle className="w-4 h-4 text-amber-500" />;
  return <Clock className="w-4 h-4 text-gray-400" />;
}

export default function ScraperHealth({ scrapers }: { scrapers: Scraper[] }) {
  const router = useRouter();
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);

  async function handleToggle(id: string, enabled: boolean) {
    setTogglingId(id);
    try {
      const res = await fetch("/api/admin/scrapers/toggle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scraperId: id, enabled: !enabled }) });
      if (!res.ok) throw new Error();
      toast.success(enabled ? "Scraper disabled" : "Scraper enabled");
      router.refresh();
    } catch { toast.error("Failed to toggle scraper"); }
    finally { setTogglingId(null); }
  }

  async function handleTrigger(id: string, label: string) {
    setTriggeringId(id);
    try {
      const res = await fetch("/api/admin/scrapers/trigger", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scraperId: id }) });
      if (!res.ok) throw new Error();
      toast.success(`${label} triggered`);
    } catch { toast.error("Failed to trigger scraper"); }
    finally { setTriggeringId(null); }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Scraper Health</h1>
        <p className="text-sm text-gray-500 mt-0.5">{scrapers.length} scrapers · {scrapers.filter(s => s.consecutiveFails >= 3).length} failing</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-5 py-3 font-medium text-gray-500">Scraper</th>
              <th className="text-left px-5 py-3 font-medium text-gray-500">Status</th>
              <th className="text-left px-5 py-3 font-medium text-gray-500">Last Run</th>
              <th className="text-left px-5 py-3 font-medium text-gray-500">Ingested</th>
              <th className="text-left px-5 py-3 font-medium text-gray-500">Workspace</th>
              <th className="text-left px-5 py-3 font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {scrapers.length === 0 && <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400 text-sm">No scrapers configured yet</td></tr>}
            {scrapers.map((s) => (
              <tr key={s.id} className={`hover:bg-gray-50 transition-colors ${s.consecutiveFails >= 3 ? "bg-red-50" : ""}`}>
                <td className="px-5 py-4">
                  <p className="font-medium text-gray-900">{s.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{s.adapterType} · {s.requestsPerMin} req/min</p>
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <StatusIcon status={s.lastRunStatus} fails={s.consecutiveFails} />
                    <span className="text-gray-700 capitalize">{s.consecutiveFails >= 3 ? "Critical" : s.lastRunStatus ?? "Never run"}</span>
                  </div>
                  {s.lastRunError && s.consecutiveFails > 0 && <p className="text-xs text-red-500 mt-1 max-w-xs truncate">{s.lastRunError}</p>}
                </td>
                <td className="px-5 py-4 text-gray-500 text-xs">{s.lastRunAt ? formatDistanceToNow(new Date(s.lastRunAt), { addSuffix: true }) : "Never"}</td>
                <td className="px-5 py-4 text-gray-700 font-medium">{s.jobsIngested.toLocaleString()}</td>
                <td className="px-5 py-4 text-gray-500 text-xs">{s.workspaceName}</td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => handleTrigger(s.id, s.label)} disabled={triggeringId === s.id} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors" title="Run now"><Play className="w-4 h-4" /></button>
                    <button onClick={() => handleToggle(s.id, s.enabled)} disabled={togglingId === s.id} className={`p-1.5 rounded-lg transition-colors ${s.enabled ? "hover:bg-red-50 text-gray-400 hover:text-red-600" : "hover:bg-green-50 text-gray-400 hover:text-green-600"}`} title={s.enabled ? "Disable" : "Enable"}><Power className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}