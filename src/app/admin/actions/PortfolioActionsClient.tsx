"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ChevronDown, CircleAlert, Loader2 } from "lucide-react";
import { AdminEmpty } from "@/app/admin/console";
import { QueueEventDetail, hasQueueEventDetail } from "@/components/dashboard/QueueEventDetail";
import { resolvePortfolioActions, escalatePortfolioActions } from "./actions";
import type {
  PortfolioActionGroup,
  PortfolioActionItem,
  PortfolioActionsSnapshot,
  PortfolioResolveResult,
} from "./portfolio-actions";

function incompleteReadMessage(snapshot: PortfolioActionsSnapshot): string {
  if (snapshot.incomplete.some((read) => read.source === "client_directory")) {
    return "The client directory could not be read, so no portfolio-wide clear state is available.";
  }

  const pendingReads = snapshot.incomplete.filter((read) => read.source === "pending_approvals");
  const cappedTenants = pendingReads
    .filter((read) => read.capped)
    .map((read) => read.siteName || read.tenantId || "a client");
  const failedTenants = pendingReads
    .filter((read) => !read.capped)
    .map((read) => read.siteName || read.tenantId || "a client");
  if (cappedTenants.length > 0 && failedTenants.length === 0) {
    const shown = cappedTenants.slice(0, 3);
    const remainder = cappedTenants.length - shown.length;
    const names = shown.join(", ");
    return remainder > 0
      ? `The pending approval read reached its limit for ${names} and ${remainder} more client${remainder === 1 ? "" : "s"}; more items may be waiting.`
      : `The pending approval read reached its limit for ${names}; more items may be waiting.`;
  }
  if (failedTenants.length === 0) {
    return "Some portfolio approvals could not be checked.";
  }
  const shown = failedTenants.slice(0, 3);
  const remainder = failedTenants.length - shown.length;
  const names = shown.join(", ");
  return remainder > 0
    ? `Pending approvals could not be checked for ${names} and ${remainder} more client${remainder === 1 ? "" : "s"}.`
    : cappedTenants.length > 0
      ? `Pending approvals could not be checked for ${names}; another client reached the read limit and may have more items waiting.`
      : `Pending approvals could not be checked for ${names}.`;
}

/** Translate a resolveEventAction failure reason into operator-facing text. The
 *  item stays pending; we never claim a failed external write succeeded. */
function failureMessage(reason?: string): string {
  switch (reason) {
    case "gbp_post_failed":
      return "Google post failed. Still pending";
    case "gbp_hours_failed":
      return "Hours update failed. Still pending";
    case "gbp_photo_failed":
      return "Photo upload failed. Still pending";
    case "review_reply_failed":
      return "Reply publish failed. Still pending";
    case "newsletter_failed":
    case "newsletter_invalid":
      return "Newsletter send failed. Still pending";
    case "draft_not_found":
      return "Draft missing. Still pending";
    case "stale_superseded":
      return "Superseded by a newer edit";
    case "already_resolved":
      return "Already handled elsewhere";
    case "not_found":
    case "wrong_tenant":
      return "No longer available";
    default:
      return "Couldn’t approve. Still pending";
  }
}

type ItemState = { failed: boolean; message?: string };

export function PortfolioActionsClient({ snapshot }: { snapshot: PortfolioActionsSnapshot }) {
  const router = useRouter();
  const [groups, setGroups] = useState<PortfolioActionGroup[]>(snapshot.groups);
  const [itemState, setItemState] = useState<Record<string, ItemState>>({});
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  // Two-step confirm for "Approve all" — first click arms it, second fires.
  const [confirmApproveAll, setConfirmApproveAll] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const armApproveAll = useCallback(() => {
    setConfirmApproveAll(true);
    confirmTimerRef.current = setTimeout(() => setConfirmApproveAll(false), 4000);
  }, []);

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current !== null) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const totalItems = useMemo(
    () => groups.reduce((sum, g) => sum + g.items.length, 0),
    [groups],
  );

  const applyResults = useCallback((results: PortfolioResolveResult[]) => {
    const byId = new Map(results.map((r) => [r.eventId, r]));
    // Drop the items that actually resolved; keep failures with their reason so
    // the operator sees exactly what didn't go through.
    setGroups((prev) =>
      prev
        .map((g) => ({
          ...g,
          items: g.items.filter((it) => !byId.get(it.id)?.changed),
        }))
        .filter((g) => g.items.length > 0),
    );
    setItemState((prev) => {
      const next = { ...prev };
      for (const r of results) {
        if (!r.changed) next[r.eventId] = { failed: true, message: failureMessage(r.reason) };
        else delete next[r.eventId];
      }
      return next;
    });
  }, []);

  const resolve = useCallback(
    (items: PortfolioActionItem[]) => {
      if (items.length === 0) return;
      const ids = items.map((i) => i.id);
      setProcessing((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.add(id));
        return next;
      });
      setItemState((prev) => {
        const next = { ...prev };
        ids.forEach((id) => delete next[id]);
        return next;
      });

      startTransition(async () => {
        try {
          const res = await resolvePortfolioActions(
            items.map((i) => ({ tenantId: i.tenantId, eventId: i.id })),
          );
          if (res.ok) applyResults(res.results);
        } finally {
          setProcessing((prev) => {
            const next = new Set(prev);
            ids.forEach((id) => next.delete(id));
            return next;
          });
          // Re-read the server truth so counts stay accurate after resolution.
          router.refresh();
        }
      });
    },
    [applyResults, router],
  );

  const approveAll = useCallback(() => {
    if (!confirmApproveAll) {
      armApproveAll();
      return;
    }
    if (confirmTimerRef.current !== null) {
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
    setConfirmApproveAll(false);
    resolve(groups.flatMap((g) => g.items));
  }, [confirmApproveAll, armApproveAll, groups, resolve]);

  // "Ask the client" — hand a draft you're unsure about to the owner's queue for
  // their call. Drops it from this queue on success (it's now theirs to decide).
  const escalate = useCallback(
    (item: PortfolioActionItem) => {
      setProcessing((prev) => new Set(prev).add(item.id));
      startTransition(async () => {
        try {
          const res = await escalatePortfolioActions([{ tenantId: item.tenantId, eventId: item.id }]);
          if (res.ok && res.results[0]?.changed) {
            setGroups((prev) =>
              prev.map((g) => ({ ...g, items: g.items.filter((it) => it.id !== item.id) })).filter((g) => g.items.length > 0),
            );
          }
        } finally {
          setProcessing((prev) => {
            const next = new Set(prev);
            next.delete(item.id);
            return next;
          });
          router.refresh();
        }
      });
    },
    [router],
  );

  const anyProcessing = processing.size > 0;
  const readsIncomplete = snapshot.incomplete.length > 0;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-[26px] sm:text-[30px] font-medium tracking-[-0.02em] text-warm-white">
            Portfolio actions
          </h1>
          <p className="mt-1 text-sm text-gray-muted">
            {totalItems > 0
              ? `${totalItems} ready to approve across ${groups.length} client${
                  groups.length === 1 ? "" : "s"
                }`
              : "Nothing waiting across the portfolio. New drafts and approvals land here."}
          </p>
        </div>
        {totalItems > 0 && (
          <button
            type="button"
            onClick={approveAll}
            disabled={anyProcessing}
            className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
              confirmApproveAll
                ? "bg-warning text-on-accent hover:bg-warning/90"
                : "bg-accent text-on-accent hover:bg-accent/90"
            }`}
          >
            {anyProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
            ) : (
              <Check className="h-4 w-4" strokeWidth={2} />
            )}
            {confirmApproveAll
              ? `Confirm — publish ${totalItems} across all clients?`
              : `Approve all ${totalItems}`}
          </button>
        )}
      </div>

      {readsIncomplete && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm"
        >
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" strokeWidth={2} aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-medium text-warm-white">This portfolio view is incomplete.</p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-gray-muted">
              {incompleteReadMessage(snapshot)}
            </p>
            <Link
              href="/admin/actions"
              className="mt-2 inline-flex min-h-8 items-center rounded-lg text-[12px] font-semibold text-warning underline decoration-warning/40 underline-offset-2 hover:decoration-warning"
            >
              Retry reads
            </Link>
          </div>
        </div>
      )}

      {totalItems === 0 && !readsIncomplete ? (
        <AdminEmpty
          tone="good"
          icon={<Check className="h-5 w-5" strokeWidth={2} />}
          title="Portfolio is clear"
          description="Nothing across any client needs drafting or approval right now."
          action={{ label: "Back to overview", href: "/admin" }}
        />
      ) : totalItems === 0 ? (
        <div className="rounded-2xl border border-glass-border bg-glass px-6 py-10 text-center">
          <p className="text-[14px] font-semibold text-warm-white">No verified approvals to display yet</p>
          <p className="mx-auto mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-gray-muted">
            The reads that completed returned no items. Retry before treating the portfolio as clear.
          </p>
          <Link
            href="/admin/actions"
            className="mt-4 inline-flex min-h-10 items-center rounded-lg bg-accent px-3.5 py-2 text-[12.5px] font-semibold text-on-accent hover:bg-accent/90"
          >
            Retry reads
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => {
            const groupBusy = group.items.some((it) => processing.has(it.id));
            return (
              <section
                key={group.tenantId}
                className="rounded-xl border border-glass-border bg-glass overflow-hidden"
              >
                <div className="flex items-center justify-between gap-2 border-b border-glass-border px-5 py-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Link
                      href={`/admin/clients/${group.tenantId}`}
                      className="truncate text-sm font-medium text-warm-white hover:text-accent"
                    >
                      {group.siteName}
                    </Link>
                    <span className="shrink-0 rounded-full bg-gray-bg px-2 py-0.5 text-[11px] text-gray-muted">
                      {group.items.length}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => resolve(group.items)}
                    disabled={anyProcessing}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-accent-dim px-2.5 py-1.5 text-[12px] font-medium text-accent transition-colors hover:bg-accent hover:text-on-accent disabled:opacity-50"
                  >
                    {groupBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
                    ) : (
                      <Check className="h-3.5 w-3.5" strokeWidth={2} />
                    )}
                    Approve all
                  </button>
                </div>
                <ul className="divide-y divide-glass-border">
                  {group.items.map((item) => {
                    const state = itemState[item.id];
                    const busy = processing.has(item.id);
                    const hasDetail = hasQueueEventDetail(item);
                    const isOpen = expanded.has(item.id);
                    return (
                      <li key={item.id} className="px-5 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="shrink-0 rounded bg-gray-bg px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-muted">
                                {item.label}
                              </span>
                              <span className="truncate text-sm text-warm-white">{item.title}</span>
                            </div>
                            {state?.failed && (
                              <p className="mt-1 flex items-center gap-1 text-[11px] text-warning">
                                <CircleAlert className="h-3 w-3" strokeWidth={2} />
                                {state.message}
                              </p>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {hasDetail && (
                              <button
                                type="button"
                                onClick={() => toggleExpanded(item.id)}
                                aria-expanded={isOpen}
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12px] font-medium text-gray-muted transition-colors hover:text-warm-white"
                              >
                                <ChevronDown
                                  className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`}
                                  strokeWidth={2}
                                />
                                {isOpen ? "Hide" : "Review"}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => escalate(item)}
                              disabled={anyProcessing}
                              title="Hand this to the client to decide"
                              className="inline-flex items-center gap-1.5 rounded-lg border border-glass-border px-2.5 py-1.5 text-[12px] font-medium text-gray-muted transition-colors hover:text-warm-white disabled:opacity-50"
                            >
                              Ask client
                            </button>
                            <button
                              type="button"
                              onClick={() => resolve([item])}
                              disabled={anyProcessing}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-bg px-2.5 py-1.5 text-[12px] font-medium text-gray-fg transition-colors hover:bg-success hover:text-on-positive disabled:opacity-50"
                            >
                              {busy ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
                              ) : (
                                <Check className="h-3.5 w-3.5" strokeWidth={2} />
                              )}
                              Approve
                            </button>
                          </div>
                        </div>
                        {hasDetail && isOpen && (
                          <QueueEventDetail
                            event={{ type: item.type, metadata: item.metadata }}
                            className="mt-2.5"
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
                {group.capped && (
                  <p className="border-t border-glass-border px-5 py-2 text-[11px] text-gray-muted">
                    Showing the first {group.items.length}. More may be waiting. Approve these,
                    then refresh.
                  </p>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
