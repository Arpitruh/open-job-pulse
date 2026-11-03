"use client";

import { useEffect, useRef, useCallback } from "react";

type SSEHandler = (data: any) => void;

export function useSSE(
  eventHandlers: Record<string, SSEHandler>,
  enabled = true
) {
  const esRef = useRef<EventSource | null>(null);
  const handlersRef = useRef(eventHandlers);

  // Keep handlers ref up to date
  useEffect(() => {
    handlersRef.current = eventHandlers;
  }, [eventHandlers]);

  useEffect(() => {
    if (!enabled) return;

    const es = new EventSource("/api/stream");
    esRef.current = es;

    es.addEventListener("connected", (e) => {
      console.log("[SSE] Connected");
    });

    es.addEventListener("heartbeat", () => {
      // Keep-alive — no action needed
    });

    // Register all event handlers
    Object.keys(handlersRef.current).forEach((event) => {
      es.addEventListener(event, (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          handlersRef.current[event]?.(data);
        } catch (err) {
          console.error("[SSE] Parse error:", err);
        }
      });
    });

    es.onerror = (err) => {
      console.error("[SSE] Error:", err);
      // Auto-reconnect is handled by EventSource natively
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [enabled]);
}
