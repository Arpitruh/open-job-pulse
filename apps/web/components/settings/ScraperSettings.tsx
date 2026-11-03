"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  Plus,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Power,
  Trash2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Scraper {
  id: string;
  label: string;
  adapterType: string;
  sourceUrl: string;
  cronSchedule: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  jobsIngested: number;
  consecutiveFails: number;
}

interface Props {
  scrapers: Scraper[];
  workspaceId: string | null;
}

const ADAPTER_TYPES = [
  { value: "GREENHOUSE", label: "Greenhouse" },
  { value: "LEVER", label: "Lever" },
  { value: "RSS_ATOM", label: "RSS / Atom Feed" },
  { value: "WORKDAY", label: "Workday" },
];

export default function ScraperSettings({ scrapers, workspaceId }: Props) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    label: "",
    adapterType: "GREENHOUSE",
    sourceUrl: "",
    cronSchedule: "0 */4 * * *",
  });

  async function handleAdd() {
    if (!workspaceId) {
      toast.error("No workspace found");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/scrapers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, workspaceId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to add scraper");
        return;
      }
      toast.success("Scraper added");
      setAdding(false);
      setForm({
        label: "",
        adapterType: "GREENHOUSE",
        sourceUrl: "",
        cronSchedule: "0 */4 * * *",
      });
      router.refresh();
    } catch {
      toast.error("Failed to add scraper");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this scraper?")) return;
    try {
      const res = await fetch(`/api/scrapers?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Scraper deleted");
      router.refresh();
    } catch {
      toast.error("Failed to delete");
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Job Sources</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Configure which job boards to scrape
          </p>
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Source
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div className="bg-white rounded-xl border border-blue-200 p-6 space-y-4">
          <h2 className="font-semibold text-gray-900 text-sm">
            New Job Source
          </h2>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Label
            </label>
            <input
              type="text"
              placeholder="e.g. Stripe Greenhouse Board"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Type
            </label>
            <select
              value={form.adapterType}
              onChange={(e) =>
                setForm({ ...form, adapterType: e.target.value })
              }
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {ADAPTER_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Board URL
            </label>
            <input
              type="url"
              placeholder="e.g. https://boards.greenhouse.io/stripe"
              value={form.sourceUrl}
              onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Schedule (cron)
            </label>
            <select
              value={form.cronSchedule}
              onChange={(e) =>
                setForm({ ...form, cronSchedule: e.target.value })
              }
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="0 */1 * * *">Every hour</option>
              <option value="0 */4 * * *">Every 4 hours</option>
              <option value="0 */8 * * *">Every 8 hours</option>
              <option value="0 8 * * *">Daily at 8am</option>
            </select>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleAdd}
              disabled={saving || !form.label || !form.sourceUrl}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-60"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Add Scraper
            </button>
            <button
              onClick={() => setAdding(false)}
              className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Scraper list */}
      {scrapers.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center justify-center py-16 text-center">
          <div className="text-4xl mb-3">🔌</div>
          <p className="text-gray-500 font-medium text-sm">
            No job sources yet
          </p>
          <p className="text-gray-400 text-xs mt-1">
            Add a Greenhouse, Lever, or RSS source to start finding jobs
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {scrapers.map((s) => (
            <div
              key={s.id}
              className="bg-white rounded-xl border border-gray-200 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900 text-sm">
                      {s.label}
                    </p>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      {s.adapterType}
                    </span>
                    {!s.enabled && (
                      <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                        Disabled
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">
                    {s.sourceUrl}
                  </p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                    <span>
                      {s.lastRunStatus === "success" ? (
                        <CheckCircle2 className="w-3 h-3 text-green-500 inline mr-1" />
                      ) : s.lastRunStatus === "failed" ? (
                        <XCircle className="w-3 h-3 text-red-500 inline mr-1" />
                      ) : (
                        <Clock className="w-3 h-3 text-gray-400 inline mr-1" />
                      )}
                      {s.lastRunAt
                        ? formatDistanceToNow(new Date(s.lastRunAt), {
                            addSuffix: true,
                          })
                        : "Never run"}
                    </span>
                    <span>{s.jobsIngested.toLocaleString()} jobs ingested</span>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(s.id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}