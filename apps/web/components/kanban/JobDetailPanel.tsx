"use client";

import { useState, useRef, useEffect } from "react";
import {
  X,
  ExternalLink,
  MapPin,
  DollarSign,
  Calendar,
  Zap,
  FileText,
  ChevronDown,
  Loader2,
  Send,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import type { JobMatch, MatchStatus } from "@/hooks/useKanban";

const STATUS_OPTIONS: { value: MatchStatus; label: string }[] = [
  { value: "DISCOVERED", label: "Discovered" },
  { value: "APPLIED", label: "Applied" },
  { value: "INTERVIEWING", label: "Interviewing" },
  { value: "OFFER_RECEIVED", label: "Offer Received" },
  { value: "REJECTED", label: "Rejected" },
  { value: "ARCHIVED", label: "Archived" },
];

const TONES = ["professional", "enthusiastic", "concise", "story-driven"];
const LENGTHS = ["short", "medium", "long"];

interface Props {
  match: JobMatch | null;
  onClose: () => void;
  onStatusChange: (matchId: string, status: MatchStatus) => void;
  onNotesSave: (matchId: string, notes: string) => void;
  hasAiKey: boolean;
  creditBalance: number;
}

export default function JobDetailPanel({
  match,
  onClose,
  onStatusChange,
  onNotesSave,
  hasAiKey,
  creditBalance,
}: Props) {
  const [notes, setNotes] = useState("");
  const [activeTab, setActiveTab] = useState<"details" | "cover-letter" | "activity">("details");
  const [tone, setTone] = useState("professional");
  const [length, setLength] = useState("medium");
  const [generating, setGenerating] = useState(false);
  const [coverLetter, setCoverLetter] = useState("");
  const streamRef = useRef<string>("");

  useEffect(() => {
    if (match) {
      setNotes(match.notes ?? "");
      setCoverLetter("");
      streamRef.current = "";
      setActiveTab("details");
    }
  }, [match?.id]);

  if (!match) return null;

  const { jobListing } = match;

async function handleGenerateCoverLetter() {
  if (!hasAiKey) {
    toast.error("Connect your API key in Settings → AI Keys first");
    return;
  }
  if (creditBalance < 10) {
    toast.error("Not enough credits. Top up in Settings → Billing");
    return;
  }

  // Capture match.id before async operations
  const currentMatchId = match?.id;
  if (!currentMatchId) return;    // ← add this guard

  setGenerating(true);
  setCoverLetter("");
  streamRef.current = "";

  try {
    const res = await fetch("/api/ai/cover-letter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        matchId: currentMatchId,   // ← use captured id
        tone,
        length,
        openingStyle: "achievement",
      }),
    });
    

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error ?? "Generation failed");
        return;
      }

      // Stream response
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        // Parse SSE chunks
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.token) {
                streamRef.current += parsed.token;
                setCoverLetter(streamRef.current);
              }
            } catch {}
          }
        }
      }
      toast.success("Cover letter generated — 10 credits used");
    } catch (err) {
      toast.error("Generation failed. Try again.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-xl bg-white z-50 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-gray-900 leading-tight truncate">
                {jobListing.jobTitle}
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {jobListing.companyName}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Quick info row */}
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <MapPin className="w-3.5 h-3.5" />
              {jobListing.workMode.replace("_", " ")}
            </span>
            {jobListing.baseSalaryMin && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <DollarSign className="w-3.5 h-3.5" />
                {Math.round(jobListing.baseSalaryMin / 1000)}k
                {jobListing.baseSalaryMax &&
                  `–${Math.round(jobListing.baseSalaryMax / 1000)}k`}{" "}
                {jobListing.currency}
              </span>
            )}
            <span className="flex items-center gap-1 text-xs text-gray-400 ml-auto">
              <Calendar className="w-3.5 h-3.5" />
              {formatDistanceToNow(new Date(match.createdAt), {
                addSuffix: true,
              })}
            </span>
          </div>

          {/* Status selector */}
          <div className="flex items-center gap-3 mt-3">
            <select
              value={match.status}
              onChange={(e) =>
                onStatusChange(match.id, e.target.value as MatchStatus)
              }
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <a
              href={jobListing.applyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Apply
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 flex-shrink-0">
          {(["details", "cover-letter", "activity"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${
                activeTab === tab
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab === "cover-letter"
                ? "Cover Letter"
                : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">
          {/* ── Details tab ─────────────────────────────────────────────── */}
          {activeTab === "details" && (
            <div className="p-6 space-y-5">
              {/* Match score breakdown */}
              {match.scoreBreakdown && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Match Breakdown
                  </h3>
                  <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">
                        Similarity Score
                      </span>
                      <span className="text-sm font-bold text-blue-600">
                        {Math.round(match.similarityScore * 100)}%
                      </span>
                    </div>
                    {match.scoreBreakdown?.matched?.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Matched</p>
                        <div className="flex flex-wrap gap-1">
                          {match.scoreBreakdown.matched.map((s: string) => (
                            <span
                              key={s}
                              className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Job description */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Description
                </h3>
                <div className="text-sm text-gray-700 leading-relaxed max-h-48 overflow-y-auto bg-gray-50 rounded-xl p-4 whitespace-pre-wrap">
                  {jobListing.descriptionRaw.slice(0, 1500)}
                  {jobListing.descriptionRaw.length > 1500 && "…"}
                </div>
              </div>

              {/* Notes */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Notes
                </h3>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes about this role — interviewer names, compensation details, follow-up reminders…"
                  rows={4}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
                <button
                  onClick={() => onNotesSave(match.id, notes)}
                  className="mt-2 flex items-center gap-1.5 text-sm text-blue-600 font-medium hover:underline"
                >
                  <Send className="w-3.5 h-3.5" />
                  Save Notes
                </button>
              </div>
            </div>
          )}

          {/* ── Cover Letter tab ─────────────────────────────────────────── */}
          {activeTab === "cover-letter" && (
            <div className="p-6 space-y-4">
              {!hasAiKey && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
                  Connect your OpenAI or Anthropic API key in{" "}
                  <a
                    href="/settings/ai-keys"
                    className="font-semibold underline"
                  >
                    Settings → AI Keys
                  </a>{" "}
                  to generate cover letters.
                </div>
              )}

              {/* Controls */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Tone
                  </label>
                  <select
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white capitalize"
                  >
                    {TONES.map((t) => (
                      <option key={t} value={t}>
                        {t.replace("-", " ")}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Length
                  </label>
                  <select
                    value={length}
                    onChange={(e) => setLength(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white capitalize"
                  >
                    {LENGTHS.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                onClick={handleGenerateCoverLetter}
                disabled={generating || !hasAiKey || creditBalance < 10}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white rounded-xl py-3 text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    Generate Cover Letter
                    <span className="text-blue-200 text-xs ml-1">10 cr</span>
                  </>
                )}
              </button>

              {/* Output */}
              {coverLetter && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Generated Letter
                    </h3>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(coverLetter);
                        toast.success("Copied to clipboard");
                      }}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Copy
                    </button>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto">
                    {coverLetter}
                    {generating && (
                      <span className="inline-block w-1.5 h-4 bg-blue-500 animate-pulse ml-0.5 align-middle" />
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Activity tab ─────────────────────────────────────────────── */}
          {activeTab === "activity" && (
            <div className="p-6">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
                Activity Log
              </h3>
              {match.activityLog.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">
                  No activity yet
                </p>
              ) : (
                <div className="space-y-3">
                  {match.activityLog.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-start gap-3 text-sm"
                    >
                      <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                      <div className="flex-1">
                        {entry.type === "status_change" && (
                          <p className="text-gray-700">
                            Moved from{" "}
                            <span className="font-medium">
                              {entry.payload.from?.replace("_", " ")}
                            </span>{" "}
                            to{" "}
                            <span className="font-medium">
                              {entry.payload.to?.replace("_", " ")}
                            </span>
                          </p>
                        )}
                        {entry.type === "note_added" && (
                          <p className="text-gray-700">Note updated</p>
                        )}
                        <p className="text-xs text-gray-400 mt-0.5">
                          {format(
                            new Date(entry.createdAt),
                            "MMM d, yyyy · h:mm a"
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}