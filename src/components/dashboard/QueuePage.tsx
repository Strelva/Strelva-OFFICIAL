"use client";

import { useState, useCallback, useMemo, useTransition } from "react";
import { XaLabel, XaSays, XaSegmented, XaTextLink } from "@/components/ui/strelva/Xa";
import { QueueCard } from "./QueueCard";
import { EmptyQueue } from "./EmptyQueue";
import { DashNote, DashPage } from "./xa/DashboardXa";
import queueStyles from "./queue.module.css";
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
  /** Super-admin/operator view — surfaces the custom-request fulfillment controls. */
  isOperator?: boolean;
}

export function QueuePage({ initialPending, initialResolved, pendingCount: initialCount, staleSectionCount = 0, compact = false, isOperator = false }: QueuePageProps) {
  const dashboard = useDashboardOptional();
  const dashboardHref = useMemo(
    () => dashboard?.dashboardHref ?? ((path: string) => path),
    [dashboard?.dashboardHref],
  );
  const [tab, setTab] = useState<"pending" | "resolved">("pending");
  const [pending, setPending] = useState(initialPending);
  const [resolved, setResolved] = useState(initialResolved);
  const [pendingCount, setPendingCount] = useState(initialCount);
  const [, startTransition] = useTransition();
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  // One decision open at a time: the first thing that waits, until the owner opens another.
  const [openId, setOpenId] = useState<string | null>(initialPending.find((event) => event.status === "pending" && event.type !== "change_request")?.id ?? null);
  const [settled, setSettled] = useState<{ title: string; action: "approved" | "dismissed" } | null>(null);

  const handleResolve = useCallback(async (id: string, action: QueueAction) => {
    const event = pending.find((e) => e.id === id);
    if (!event) return;
    setProcessingIds((prev) => new Set(prev).add(id));
    setDecisionError(null);

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

    // The yes stays on screen, working, until the server answers: a row only
    // leaves Needs you once the change really happened.
    if (!terminal) setPending((prev) => prev.map((e) => e.id === id ? updatedEvent : e));

    startTransition(async () => {
      try {
        const res = await fetch(dashboardHref(`/api/queue/${id}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        if (!res.ok) {
          const error = ((await res.json().catch(() => null)) as { error?: string } | null)?.error;
          setDecisionError(error || "That didn't go through. Nothing changed.");
          if (!terminal) setPending((prev) => prev.map((e) => e.id === id ? event : e));
        } else if (terminal) {
          const rest = pending.filter((e) => e.id !== id);
          setPending(rest);
          setOpenId((current) => current === id ? rest.find((e) => e.status === "pending" && e.type !== "change_request")?.id ?? null : current);
          setResolved((prev) => [updatedEvent, ...prev]);
          setPendingCount((prev) => Math.max(0, prev - 1));
          if (action === "approved" || action === "dismissed") setSettled({ title: event.title, action });
        }
      } catch {
        setDecisionError("That didn't go through. Nothing changed.");
        if (!terminal) setPending((prev) => prev.map((e) => e.id === id ? event : e));
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
  const waitingWords = pendingCount > 0
    ? `${pendingCount} ${pendingCount === 1 ? "change waits" : "changes wait"} for your yes.`
    : "Nothing waits on you.";

  const list = <div className="flex flex-col gap-4">
    {decisionError ? <DashNote tone="down" role="alert">{decisionError}</DashNote> : null}
    {settled && tab === "pending" ? <XaSays links={settled.action === "approved" ? [<XaTextLink key="history" href={dashboardHref("/dashboard/history")}>See it in History</XaTextLink>] : undefined}>
      {settled.action === "approved" ? `Made live: ${settled.title}.` : `Skipped: ${settled.title}. Nothing changed on your site.`}
    </XaSays> : null}
    {tab === "resolved" && aiHandledThisMonth > 0 ? (
      <p className="m-0 text-[14px] text-[var(--st-text-2)]">Strelva finished {aiHandledThisMonth} update{aiHandledThisMonth === 1 ? "" : "s"} this month.</p>
    ) : null}
    {currentEvents.length === 0 ? (
      tab === "pending" ? <EmptyQueue staleSectionCount={staleSectionCount} recent={resolved.slice(0, 3)} compact={compact} />
        : <p className="m-0 text-[15px] text-[var(--st-text-2)]">Nothing finished yet. Changes you make live or skip land here.</p>
    ) : (
      <ul className={queueStyles.list} aria-label={tab === "pending" ? "Needs you" : "Done"}>
        {currentEvents.map((event) => (
          <li key={event.id}>
            <QueueCard
              event={event}
              onApprove={handleApprove}
              onDismiss={handleDismiss}
              onWorkflowAction={handleWorkflowAction}
              disabled={processingIds.has(event.id)}
              isOperator={isOperator}
              open={tab === "pending" && openId === event.id}
              onOpenChange={(next) => setOpenId(next ? event.id : null)}
            />
          </li>
        ))}
      </ul>
    )}
  </div>;

  if (compact) {
    return <section className="flex flex-col gap-3" aria-labelledby="needs-you-label">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <XaLabel id="needs-you-label">Needs you</XaLabel>
        <span className="text-[13px] text-[var(--st-text-3)]">{waitingWords}</span>
      </div>
      {list}
    </section>;
  }

  return (
    <DashPage
      title="Needs you."
      quiet={waitingWords}
      actions={<XaSegmented label="Which changes" value={tab} onChange={setTab} options={[
        { value: "pending", label: pendingCount > 0 ? `Open ${pendingCount}` : "Open" },
        { value: "resolved", label: resolved.length > 0 ? `Done ${resolved.length}` : "Done" },
      ]} />}
      label="Needs you"
    >
      {list}
    </DashPage>
  );
}
