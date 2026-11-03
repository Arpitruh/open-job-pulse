"use client";

import { Droppable } from "@hello-pangea/dnd";
import JobCard from "./JobCard";
import type { JobMatch, MatchStatus } from "@/hooks/useKanban";

interface Props {
  status: MatchStatus;
  label: string;
  color: string;
  matches: JobMatch[];
  onCardClick: (match: JobMatch) => void;
  loadingId: string | null;
}

export default function Column({
  status,
  label,
  color,
  matches,
  onCardClick,
  loadingId,
}: Props) {
  return (
    <div className="flex flex-col min-w-[280px] max-w-[280px] bg-gray-50 rounded-2xl">
      {/* Column header */}
      <div className="px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
          <span className="text-sm font-semibold text-gray-700">{label}</span>
        </div>
        <span className="text-xs font-medium text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">
          {matches.length}
        </span>
      </div>

      {/* Droppable area */}
      <Droppable droppableId={status}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 px-3 pb-3 space-y-2.5 min-h-[200px] rounded-b-2xl transition-colors ${
              snapshot.isDraggingOver ? "bg-blue-50" : ""
            }`}
          >
            {matches.length === 0 && !snapshot.isDraggingOver && (
              <div className="flex flex-col items-center justify-center h-28 border-2 border-dashed border-gray-200 rounded-xl px-3 text-center">
                <p className="text-xs text-gray-400 font-medium">
                  No jobs here
                </p>
                {status === "DISCOVERED" && (
                  <p className="text-xs text-gray-300 mt-1">
                    Jobs will appear as they're matched
                  </p>
                )}
              </div>
            )}
            {matches.map((match, index) => (
              <JobCard
                key={match.id}
                match={match}
                index={index}
                onClick={onCardClick}
                isLoading={loadingId === match.id}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}
