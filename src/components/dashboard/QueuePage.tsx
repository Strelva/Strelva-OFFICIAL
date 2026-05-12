"use client";

import { useState, useCallback, useTransition } from "react";
import { Clock3 } from "lucide-react";
import { QueueCard } from "./QueueCard";
import { EmptyQueue } from "./EmptyQueue";
import { SuggestionCard } from "./SuggestionCard";
import type { UnifiedEvent } from "@/lib/types";
import { useDashboardOptional } from "./DashboardContext";

type QueueAction =
  | "approved"
  | "dismissed"
  | "triaged"
  | "quoted"
  | "accepted"
  | "in_progress"
  | "shipped"
  | "declined";

interface QueuePageProps {
  initialPending: UnifiedEvent[];
  initialResolved: UnifiedEvent[];
  pendingCount: number;
  staleSectionCount?: number;
  compact?: boolean;
}

export function QueuePage({ initialPending, initialResolved, pendingCount: initialCount, staleSectionCount = 0, compact = false }: QueuePageProps) {
  const dashboard = useDashboardOptional();
  const dashboardHref = dashboard?.dashboardHref ?? ((path: string) => path);
  const [tab, setTab] = useState<"pending" | "resolved">("pending");
  const [pending, setPending] = useState(initialPending);
  const [resolved, setResolved] = useState(initialResolved);
  const [pendingCount, setPendingCount] = useState(initialCount);
  const [, startTransition] = useTransition();
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  const handleResolve = useCallback(async (id: string, action: QueueAction) => {
    setProcessingIds((prev) => new Set(prev).add(id));
    const event = pending.find((e) => e.id === id);
    if (!event) return;

    const terminal = action === "approved" || action === "dismissed" || action === "shipped" || action === "declined";
    const resolvedStatus = action === "shipped"
      ? "approved"
      : action === "declined"
        ? "dismissed"
        : action;
    const updatedEvent = {
      ...event,
      status: terminal ? resolvedStatus : event.status,
      resolvedAt: terminal ? new Date().toISOString() : event.resolvedAt,
      metadata: {
        ...event.metadata,
        workflowStatus: action === "approved" || action === "dismissed" ? event.metadata?.workflowStatus : action,
        workflowUpdatedAt: new Date().toISOString(),
      },
    } as UnifiedEvent;

    if (terminal) {
      setPending((prev) => prev.filter((e) => e.id !== id));
      setResolved((prev) => [updatedEvent, ...prev]);
      setPendingCount((prev) => Math.max(0, prev - 1));
    } else {
      setPending((prev) => prev.map((e) => e.id === id ? updatedEvent : e));
    }

    startTransition(async () => {
      try {
        const res = await fetch(dashboardHref(`/api/queue/${id}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        if (!res.ok) {
          setPending((prev) => terminal ? [event, ...prev] : prev.map((e) => e.id === id ? event : e));
          if (terminal) {
            setResolved((prev) => prev.filter((e) => e.id !== id));
            setPendingCount((prev) => prev + 1);
          }
        }
      } catch {
        setPending((prev) => terminal ? [event, ...prev] : prev.map((e) => e.id === id ? event : e));
        if (terminal) {
          setResolved((prev) => prev.filter((e) => e.id !== id));
          setPendingCount((prev) => prev + 1);
        }
      } finally {
        setProcessingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    });
  }, [dashboardHref, pending]);

  const handleApprove = useCallback((id: string) => handleResolve(id, "approved"), [handleResolve]);
  const handleDismiss = useCallback((id: string) => handleResolve(id, "dismissed"), [handleResolve]);
  const handleWorkflowAction = useCallback((id: string, action: Exclude<QueueAction, "approved" | "dismissed">) => {
    handleResolve(id, action);
  }, [handleResolve]);

  const currentEvents = tab === "pending" ? pending : resolved;
  const monthAgo = Date.now() - 30 * 86_400_000;
  const aiHandledThisMonth = resolved.filter((event) => {
    const resolvedAt = event.resolvedAt || event.createdAt;
    return event.source === "ai" && new Date(resolvedAt).getTime() >= monthAgo;
  }).length;

  return (
    <div className="flex flex-col h-full animate-route-enter">
      {/* Header */}
      <header className={`shrink-0 border-b border-glass-border ${compact ? "px-4 py-4" : "px-4 pb-5 pt-5 sm:px-8 sm:pt-7"}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted mb-2">
              AI control center
            </p>
            <h1 className={`${compact ? "text-[22px]" : "text-[24px] sm:text-[30px]"} font-semibold text-warm-black tracking-[-0.02em]`}>
              Needs You
            </h1>
            <p className="text-[13px] text-gray-muted mt-2">
              {pendingCount > 0
                ? `${pendingCount} item${pendingCount === 1 ? "" : "s"} waiting for your okay before going live`
                : "Nothing needs you right now. Drafts, replies, and larger changes appear here before they go live."}
            </p>
          </div>
          {staleSectionCount > 0 && (
            <div className="rounded-xl border border-glass-border bg-glass px-3 py-2 text-[12px] text-gray-fg">
              {staleSectionCount} older site area{staleSectionCount === 1 ? "" : "s"} being watched
            </div>
          )}
        </div>
      </header>

      {/* Tabs - min-h ensures 44px tap targets */}
      <div className={`shrink-0 pt-4 ${compact ? "px-4" : "px-4 sm:px-8"}`}>
        <div className="flex gap-1 p-1 bg-surface-inset border border-glass-border rounded-xl w-fit">
          <button
            onClick={() => setTab("pending")}
            className={`px-4 py-2 min-h-[42px] text-[13px] font-medium rounded-lg transition-all duration-200 ${
              tab === "pending"
                ? "bg-surface-raised text-warm-black shadow-sm"
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
            className={`px-4 py-2 min-h-[42px] text-[13px] font-medium rounded-lg transition-all duration-200 ${
              tab === "resolved"
                ? "bg-surface-raised text-warm-black shadow-sm"
                : "text-gray-muted hover:text-gray-fg"
            }`}
          >
            Done
          </button>
        </div>
      </div>

      {/* Content with crossfade */}
      <div className={`flex-1 overflow-y-auto py-5 ${compact ? "px-4" : "px-4 sm:px-8"}`}>
        <div className={`queue-tab-content ${compact ? "max-w-none" : "max-w-3xl"}`}>
          {tab === "resolved" && aiHandledThisMonth > 0 && (
            <p className="text-[13px] text-gray-muted mb-3">
              The AI handled {aiHandledThisMonth} item{aiHandledThisMonth === 1 ? "" : "s"} this month.
            </p>
          )}
          {currentEvents.length === 0 ? (
            tab === "pending" ? (
              staleSectionCount > 0 ? (
                <div className="rounded-xl border border-glass-border bg-surface-raised p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-accent-dim text-accent flex items-center justify-center shrink-0">
                      <Clock3 className="w-4 h-4" strokeWidth={1.5} />
                    </div>
                    <div>
                      <p className="text-[14px] font-medium text-warm-black">
                        {staleSectionCount} site area{staleSectionCount === 1 ? "" : "s"} could use a refresh
                      </p>
                      <p className="text-[12px] text-gray-fg mt-1">
                        Nothing needs your okay, but the AI is watching older site content.
                      </p>
                    </div>
                  </div>
                </div>
              ) : resolved.length > 0 ? (
                <div className="space-y-4">
                  <EmptyQueue />
                  <div className="rounded-xl border border-glass-border bg-surface-raised p-4">
                    <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-gray-muted">
                      Recently handled
                    </p>
                    <div className="mt-3 space-y-2">
                      {resolved.slice(0, 3).map((event) => (
                        <div
                          key={event.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-gray-border/60 bg-surface px-3 py-2"
                        >
                          <span className="min-w-0 truncate text-[13px] text-warm-black">
                            {event.title}
                          </span>
                          <span className="shrink-0 rounded-full bg-success-dim px-2 py-0.5 text-[10px] font-medium text-success">
                            {event.status === "approved" ? "Approved" : "Handled"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <EmptyQueue />
              )
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
                  {event.type === "suggestion" ? (
                    <SuggestionCard
                      event={event}
                      onApprove={handleApprove}
                      onDismiss={handleDismiss}
                      disabled={processingIds.has(event.id)}
                    />
                  ) : (
                    <QueueCard
                      event={event}
                      onApprove={handleApprove}
                      onDismiss={handleDismiss}
                      onWorkflowAction={handleWorkflowAction}
                      disabled={processingIds.has(event.id)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
