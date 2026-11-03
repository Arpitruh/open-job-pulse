"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  BrainCircuit,
  Zap,
  Loader2,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  BookOpen,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useSSE } from "@/hooks/useSSE";

interface Resource {
  title: string;
  url: string;
  free: boolean;
}

interface Gap {
  skill: string;
  demandedIn: string;
  avgSalaryPremium: string;
  priority: string;
  learningResources: Resource[];
}

interface Strength {
  skill: string;
  presentIn: string;
}

interface Report {
  yourStrengths: Strength[];
  criticalGaps: Gap[];
  niceToHave: { skill: string; demandedIn: string; priority: string }[];
  narrativeInsight: string;
}

interface Props {
  hasAiKey: boolean;
  creditBalance: number;
  latestReport: {
    id: string;
    report: any;
    listingsAnalyzed: number | null;
    createdAt: string;
    completedAt: string | null;
  } | null;
  inProgress: boolean;
  matchCount: number;
  parsedSkills: string[];
}

export default function SkillsGapClient({
  hasAiKey,
  creditBalance,
  latestReport,
  inProgress: initialInProgress,
  matchCount,
  parsedSkills,
}: Props) {
  const [running, setRunning] = useState(initialInProgress);
  const [report, setReport] = useState<Report | null>(
    latestReport?.report ?? null
  );
  const [reportMeta, setReportMeta] = useState(latestReport);
  const [expandedGap, setExpandedGap] = useState<string | null>(null);
  const cost = report ? 10 : 20;

  // SSE — update when analysis completes
  useSSE({
    skills_gap_completed: ({ reportId }: any) => {
      setRunning(false);
      toast.success("Skills gap analysis complete!");
      // Reload to get fresh data
      window.location.reload();
    },
    skills_gap_failed: ({ error }: any) => {
      setRunning(false);
      toast.error(`Analysis failed: ${error}`);
    },
    skills_gap_started: () => {
      setRunning(true);
    },
  });

  async function handleAnalyze() {
    if (!hasAiKey) {
      toast.error("Connect your API key in Settings → AI Keys first");
      return;
    }
    if (creditBalance < cost) {
      toast.error(`Need ${cost} credits. Top up in Settings → Billing`);
      return;
    }
    if (matchCount < 5) {
      toast.error(
        `Need at least 5 active job matches. You have ${matchCount}.`
      );
      return;
    }

    setRunning(true);
    try {
      const res = await fetch("/api/ai/skills-gap", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to start analysis");
        setRunning(false);
        return;
      }
      toast.success(data.message);
    } catch {
      toast.error("Failed to start analysis");
      setRunning(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <BrainCircuit className="w-5 h-5 text-blue-600" />
            Skills Gap Analyzer
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Analyzes your entire job pipeline to surface what skills to learn next
          </p>
        </div>
        <button
          onClick={handleAnalyze}
          disabled={running || !hasAiKey || matchCount < 5}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {running ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Analyzing…
            </>
          ) : (
            <>
              {report ? (
                <RefreshCw className="w-4 h-4" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              {report ? "Refresh Analysis" : "Run Analysis"}
              <span className="text-blue-200 text-xs">{cost} cr</span>
            </>
          )}
        </button>
      </div>

      {/* Setup warnings */}
      {!hasAiKey && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
          Connect your API key in{" "}
          <a href="/settings/ai-keys" className="font-semibold underline">
            Settings → AI Keys
          </a>{" "}
          to run the analysis.
        </div>
      )}

      {matchCount < 5 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          You need at least 5 active job matches for a meaningful analysis. You
          have {matchCount}.{" "}
          <a href="/settings/scrapers" className="font-semibold underline">
            Add more job sources →
          </a>
        </div>
      )}

      {/* Running state */}
      {running && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-center">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
          <p className="font-medium text-blue-900">
            Analyzing {matchCount} job listings…
          </p>
          <p className="text-sm text-blue-700 mt-1">
            This takes about 30 seconds. You&apos;ll get a notification when it&apos;s
            ready.
          </p>
        </div>
      )}

      {/* Report */}
      {report && !running && (
        <>
          {/* Meta */}
          {reportMeta && (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span>
                Based on {reportMeta.listingsAnalyzed} listings ·{" "}
                {formatDistanceToNow(new Date(reportMeta.createdAt), {
                  addSuffix: true,
                })}
              </span>
            </div>
          )}

          {/* Narrative insight */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-6 text-white">
            <div className="flex items-center gap-2 mb-2">
              <BrainCircuit className="w-4 h-4" />
              <span className="text-sm font-semibold">AI Insight</span>
            </div>
            <p className="text-blue-50 leading-relaxed text-sm">
              {report.narrativeInsight}
            </p>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-green-600">
                {report.yourStrengths.length}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">Strengths</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-red-500">
                {report.criticalGaps.length}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">Critical Gaps</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-amber-500">
                {report.niceToHave.length}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">Nice to Have</p>
            </div>
          </div>

          {/* Strengths */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              Your Strengths
            </h2>
            <div className="flex flex-wrap gap-2">
              {report.yourStrengths.map((s) => (
                <div
                  key={s.skill}
                  className="flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-full px-3 py-1.5"
                >
                  <span className="text-sm font-medium text-green-800">
                    {s.skill}
                  </span>
                  <span className="text-xs text-green-600">{s.presentIn}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Critical Gaps */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              Critical Gaps
            </h2>
            <div className="space-y-3">
              {report.criticalGaps.map((gap) => (
                <div
                  key={gap.skill}
                  className="border border-gray-200 rounded-xl overflow-hidden"
                >
                  <button
                    onClick={() =>
                      setExpandedGap(
                        expandedGap === gap.skill ? null : gap.skill
                      )
                    }
                    className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-gray-900 text-sm">
                        {gap.skill}
                      </span>
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                        {gap.demandedIn}
                      </span>
                      {gap.avgSalaryPremium && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" />
                          {gap.avgSalaryPremium}
                        </span>
                      )}
                    </div>
                    <span className="text-gray-400 text-xs">
                      {expandedGap === gap.skill ? "▲" : "▼"}
                    </span>
                  </button>

                  {expandedGap === gap.skill &&
                    gap.learningResources.length > 0 && (
                      <div className="px-4 pb-4 border-t border-gray-100">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mt-3 mb-2 flex items-center gap-1">
                          <BookOpen className="w-3 h-3" />
                          Learning Resources
                        </p>
                        <div className="space-y-1.5">
                          {gap.learningResources.map((r) => (
                            <a
                              key={r.title}
                              href={r.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                            >
                              <ExternalLink className="w-3 h-3 flex-shrink-0" />
                              {r.title}
                              {r.free && (
                                <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                                  Free
                                </span>
                              )}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                </div>
              ))}
            </div>
          </div>

          {/* Nice to Have */}
          {report.niceToHave.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-4 text-sm">
                Nice to Have
              </h2>
              <div className="flex flex-wrap gap-2">
                {report.niceToHave.map((s) => (
                  <div
                    key={s.skill}
                    className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-full px-3 py-1.5"
                  >
                    <span className="text-sm font-medium text-amber-800">
                      {s.skill}
                    </span>
                    <span className="text-xs text-amber-600">
                      {s.demandedIn}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {!report && !running && (
        <div className="bg-white rounded-2xl border border-gray-200 flex flex-col items-center justify-center py-16 text-center px-6">
          <BrainCircuit className="w-12 h-12 text-gray-300 mb-4" />
          <h2 className="text-lg font-semibold text-gray-700 mb-2">
            No analysis yet
          </h2>
          <p className="text-sm text-gray-500 max-w-sm">
            Run your first Skills Gap Analysis to see which skills to prioritize
            for your target roles.
          </p>
          {parsedSkills.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-4 justify-center max-w-sm">
              {parsedSkills.slice(0, 8).map((s) => (
                <span
                  key={s}
                  className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full"
                >
                  {s}
                </span>
              ))}
              {parsedSkills.length > 8 && (
                <span className="text-xs text-gray-400">
                  +{parsedSkills.length - 8} more
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}