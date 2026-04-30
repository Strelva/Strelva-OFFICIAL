"use client";

import { useState, useCallback, useTransition } from "react";
import { QueueCard } from "./QueueCard";
import { EmptyQueue } from "./EmptyQueue";
import type { UnifiedEvent } from "@/lib/types";

interface QueuePageProps {
  initialPending: UnifiedEvent[];
  initialResolved: UnifiedEvent[];
  pendingCount: number;
}

export function QueuePage({ initialPending, initialResolved, pendingCount: initialCount }: QueuePageProps) {
  const [tab, setTab] = useState<"pending" | "resolved">("pending");
  const [pending, setPending] = useState(initialPending);
  const [resolved, setResolved] = useState(initialResolved);
  const [pendingCount, setPendingCount] = useState(initialCount);
  const [, startTransition] = useTransition();
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  const handleResolve = useCallback(async (id: string, action: "approved" | "dismissed") => {
    setProcessingIds((prev) => new Set(prev).add(id));
    const event = pending.find((e) => e.id === id);
    if (!event) return;

    const updatedEvent = { ...event, status: action, resolvedAt: new Date().toISOString() } as UnifiedEvent;

    setPending((prev) => prev.filter((e) => e.id !== id));
    setResolved((prev) => [updatedEvent, ...prev]);
    setPendingCount((prev) => Math.max(0, prev - 1));

    startTransition(async () => {
      try {
        const res = await fetch(`/api/queue/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        if (!res.ok) {
          setPending((prev) => [event, ...prev]);
          setResolved((prev) => prev.filter((e) => e.id !== id));
          setPendingCount((prev) => prev + 1);
        }
      } catch {
        setPending((prev) => [event, ...prev]);
        setResolved((prev) => prev.filter((e) => e.id !== id));
        setPendingCount((prev) => prev + 1);
      } finally {
        setProcessingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    });
  }, [pending]);

  const handleApprove = useCallback((id: string) => handleResolve(id, "approved"), [handleResolve]);
  const handleDismiss = useCallback((id: string) => handleResolve(id, "dismissed"), [handleResolve]);

  const currentEvents = tab === "pending" ? pending : resolved;

  return (
    <div className="flex flex-col h-full animate-route-enter">
      {/* Header */}
      <header className="shrink-0 px-4 sm:px-6 pt-4 sm:pt-6 pb-4 border-b border-glass-border">
        <h1 className="text-[18px] sm:text-[20px] font-semibold text-warm-black">Queue</h1>
        <p className="text-[13px] text-gray-muted mt-1">
          {pendingCount > 0 ? `${pendingCount} items need your attention` : "You're all caught up"}
        </p>
      </header>

      {/* Tabs - min-h ensures 44px tap targets */}
      <div className="shrink-0 px-4 sm:px-6 pt-4">
        <div className="flex gap-1 p-1 bg-surface-inset rounded-lg w-fit">
          <button
            onClick={() => setTab("pending")}
            className={`px-4 py-2 min-h-[44px] text-[13px] font-medium rounded-md transition-all duration-200 ${
              tab === "pending"
                ? "bg-surface text-warm-black shadow-sm"
                : "text-gray-muted hover:text-gray-fg"
            }`}
          >
            Needs You
            {pendingCount > 0 && (
              <span className="ml-2 px-1.5 py-0.5 text-[10px] font-semibold bg-accent-dim text-accent rounded-full">
                {pendingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("resolved")}
            className={`px-4 py-2 min-h-[44px] text-[13px] font-medium rounded-md transition-all duration-200 ${
              tab === "resolved"
                ? "bg-surface text-warm-black shadow-sm"
                : "text-gray-muted hover:text-gray-fg"
            }`}
          >
            Done
          </button>
        </div>
      </div>

      {/* Content with crossfade */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
        <div className="queue-tab-content">
          {currentEvents.length === 0 ? (
            tab === "pending" ? (
              <EmptyQueue />
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <p className="text-[13px] text-gray-muted">No completed items yet</p>
              </div>
            )
          ) : (
            <div className="space-y-2">
              {currentEvents.map((event, index) => (
                <div
                  key={event.id}
                  className="animate-queue-card-enter"
                  style={{ animationDelay: `${index * 40}ms` }}
                >
                  <QueueCard
                    event={event}
                    onApprove={handleApprove}
                    onDismiss={handleDismiss}
                    disabled={processingIds.has(event.id)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
