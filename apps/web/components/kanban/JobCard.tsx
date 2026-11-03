"use client";

import { Draggable } from "@hello-pangea/dnd";
import { MapPin, DollarSign, ExternalLink, FileText, Zap, Building2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { JobMatch } from "@/hooks/useKanban";

interface Props {
  match: JobMatch;
  index: number;
  onClick: (match: JobMatch) => void;
  isLoading: boolean;
}

const workModeColors: Record<string, string> = {
  REMOTE: "bg-green-100 text-green-700",
  HYBRID: "bg-yellow-100 text-yellow-700",
  ON_SITE: "bg-gray-100 text-gray-600",
};

const workModeLabels: Record<string, string> = {
  REMOTE: "🌍 Remote",
  HYBRID: "🏢 Hybrid",
  ON_SITE: "📍 On-site",
};

function ScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 75 ? "bg-green-100 text-green-700 border border-green-200" :
    pct >= 50 ? "bg-blue-100 text-blue-700 border border-blue-200" :
    "bg-gray-100 text-gray-500 border border-gray-200";
  const label =
    pct >= 75 ? "Strong match" :
    pct >= 50 ? "Good match" :
    "Possible match";
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>
      {pct}% · {label}
    </span>
  );
}

export default function JobCard({ match, index, onClick, isLoading }: Props) {
  const { jobListing } = match;

  return (
    <Draggable draggableId={match.id} index={index} isDragDisabled={isLoading}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => onClick(match)}
          className={`bg-white rounded-xl border p-4 cursor-pointer select-none
            transition-all duration-150
            ${snapshot.isDragging
              ? "shadow-xl border-blue-300 rotate-1 scale-105"
              : "border-gray-200 hover:border-blue-200 hover:shadow-sm"
            }
            ${isLoading ? "opacity-60" : ""}
          `}
        >
          {/* Company + score */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-bold">
                  {jobListing.companyName.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-500 truncate">
                  {jobListing.companyName}
                </p>
                <p className="text-sm font-semibold text-gray-900 truncate leading-tight">
                  {jobListing.jobTitle}
                </p>
              </div>
            </div>
          </div>

          {/* Score badge */}
          <div className="mb-2">
            <ScoreBadge score={match.similarityScore} />
          </div>

          {/* Tags */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              workModeColors[jobListing.workMode] ?? "bg-gray-100 text-gray-600"
            }`}>
              {workModeLabels[jobListing.workMode] ?? jobListing.workMode}
            </span>

            {jobListing.baseSalaryMin && (
              <span className="flex items-center gap-0.5 text-xs text-gray-500 bg-gray-50 px-2 py-0.5 rounded-full">
                <DollarSign className="w-3 h-3" />
                {Math.round(jobListing.baseSalaryMin / 1000)}k
                {jobListing.baseSalaryMax && `–${Math.round(jobListing.baseSalaryMax / 1000)}k`}
              </span>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-2 mt-2.5 pt-2 border-t border-gray-50">
            <span className="text-xs text-gray-400">
              {formatDistanceToNow(new Date(match.createdAt), { addSuffix: true })}
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              {match.notes && <FileText className="w-3 h-3 text-gray-400" />}
              {match.coverLetters.length > 0 && <Zap className="w-3 h-3 text-blue-400" />}
              <a
                href={jobListing.applyUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-gray-400 hover:text-blue-500 transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      )}
    </Draggable>
  );
}