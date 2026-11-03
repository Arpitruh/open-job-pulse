"use client";

import { useState, useCallback } from "react";
import { DragDropContext, type DropResult } from "@hello-pangea/dnd";
import Column from "./Column";
import JobDetailPanel from "./JobDetailPanel";
import { useKanban, type JobMatch, type MatchStatus } from "@/hooks/useKanban";
import { useSSE } from "@/hooks/useSSE";
import { Filter, RefreshCw } from "lucide-react";

const COLUMNS: { status: MatchStatus; label: string; color: string }[] = [
  { status: "DISCOVERED", label: "Discovered", color: "bg-blue-400" },
  { status: "APPLIED", label: "Applied", color: "bg-indigo-400" },
  { status: "INTERVIEWING", label: "Interviewing", color: "bg-amber-400" },
  { status: "OFFER_RECEIVED", label: "Offer Received", color: "bg-green-400" },
  { status: "REJECTED", label: "Rejected", color: "bg-red-400" },
  { status: "ARCHIVED", label: "Archived", color: "bg-gray-400" },
];

interface Props {
  initialMatches: JobMatch[];
  hasAiKey: boolean;
  creditBalance: number;
}

export default function Board({ initialMatches, hasAiKey, creditBalance }: Props) {
  const { matches, loading, updateStatus, updateNotes, syncStatus, getColumn } =
    useKanban(initialMatches);

  const [selectedMatch, setSelectedMatch] = useState<JobMatch | null>(null);
  const [hideArchived, setHideArchived] = useState(true);

  // SSE — sync Telegram-triggered status changes in real time
  useSSE({
    match_status_updated: useCallback(
      ({ matchId, status }: { matchId: string; status: MatchStatus }) => {
        syncStatus(matchId, status);
        // Update selected match if open
        setSelectedMatch((prev) =>
          prev?.id === matchId ? { ...prev, status } : prev
        );
      },
      [syncStatus]
    ),
  });

  function onDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    )
      return;

    const newStatus = destination.droppableId as MatchStatus;
    updateStatus(draggableId, newStatus);
  }

  const visibleColumns = hideArchived
    ? COLUMNS.filter((c) => c.status !== "ARCHIVED")
    : COLUMNS;

  const totalActive = matches.filter(
    (m) => m.status !== "ARCHIVED" && m.status !== "REJECTED"
  ).length;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-5 flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Job Board</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {totalActive} active application{totalActive !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setHideArchived((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${
              hideArchived
                ? "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                : "bg-blue-50 border-blue-200 text-blue-700"
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            {hideArchived ? "Show Archived" : "Hide Archived"}
          </button>
        </div>
      </div>

      {/* Board */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
          {visibleColumns.map((col) => (
            <Column
              key={col.status}
              status={col.status}
              label={col.label}
              color={col.color}
              matches={getColumn(col.status)}
              onCardClick={(match) => {
                setSelectedMatch(
                  matches.find((m) => m.id === match.id) ?? match
                );
              }}
              loadingId={loading}
            />
          ))}
        </div>
      </DragDropContext>

      {/* Detail panel */}
      {selectedMatch && (
        <JobDetailPanel
          match={matches.find((m) => m.id === selectedMatch.id) ?? selectedMatch}
          onClose={() => setSelectedMatch(null)}
          onStatusChange={updateStatus}
          onNotesSave={updateNotes}
          hasAiKey={hasAiKey}
          creditBalance={creditBalance}
        />
      )}
    </div>
  );
}