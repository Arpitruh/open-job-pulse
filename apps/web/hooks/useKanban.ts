"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";

export type MatchStatus =
  | "DISCOVERED"
  | "APPLIED"
  | "INTERVIEWING"
  | "OFFER_RECEIVED"
  | "REJECTED"
  | "ARCHIVED";

export interface JobMatch {
  id: string;
  status: MatchStatus;
  similarityScore: number;
  scoreBreakdown: any;
  notes: string | null;
  appliedAt: string | null;
  createdAt: string;
  updatedAt: string;
  jobListing: {
    companyName: string;
    jobTitle: string;
    workMode: string;
    baseSalaryMin: number | null;
    baseSalaryMax: number | null;
    currency: string | null;
    applyUrl: string;
    sourcePortal: string;
    postedAt: string | null;
    descriptionRaw: string;
  };
  activityLog: {
    id: string;
    type: string;
    payload: any;
    createdAt: string;
  }[];
  coverLetters: {
    id: string;
    tone: string;
    createdAt: string;
  }[];
}

export function useKanban(initialMatches: JobMatch[]) {
  const [matches, setMatches] = useState<JobMatch[]>(initialMatches);
  const [loading, setLoading] = useState<string | null>(null);

  const updateStatus = useCallback(
    async (matchId: string, status: MatchStatus) => {
      // Optimistic update
      setMatches((prev) =>
        prev.map((m) =>
          m.id === matchId ? { ...m, status, updatedAt: new Date().toISOString() } : m
        )
      );
      setLoading(matchId);

      try {
        const res = await fetch("/api/matches", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matchId, status }),
        });

        if (!res.ok) throw new Error("Failed to update status");
        toast.success(`Moved to ${status.replace("_", " ").toLowerCase()}`);
      } catch {
        // Revert on failure
        setMatches((prev) =>
          prev.map((m) =>
            m.id === matchId
              ? { ...m, status: initialMatches.find((im) => im.id === matchId)?.status ?? m.status }
              : m
          )
        );
        toast.error("Failed to update status");
      } finally {
        setLoading(null);
      }
    },
    [initialMatches]
  );

  const updateNotes = useCallback(async (matchId: string, notes: string) => {
    try {
      const res = await fetch("/api/matches", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, notes }),
      });
      if (!res.ok) throw new Error("Failed to save notes");
      setMatches((prev) =>
        prev.map((m) => (m.id === matchId ? { ...m, notes } : m))
      );
      toast.success("Notes saved");
    } catch {
      toast.error("Failed to save notes");
    }
  }, []);

  // Called by SSE to sync external updates
  const syncStatus = useCallback((matchId: string, status: MatchStatus) => {
    setMatches((prev) =>
      prev.map((m) => (m.id === matchId ? { ...m, status } : m))
    );
  }, []);

  const getColumn = useCallback(
    (status: MatchStatus) => matches.filter((m) => m.status === status),
    [matches]
  );

  return { matches, loading, updateStatus, updateNotes, syncStatus, getColumn };
}