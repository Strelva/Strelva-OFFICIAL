"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ChevronDown, CircleAlert, Loader2 } from "lucide-react";
import { QueueEventDetail, hasQueueEventDetail } from "@/components/dashboard/QueueEventDetail";
import { resolvePortfolioActions } from "./actions";
import type {
  PortfolioActionGroup,
  PortfolioActionItem,
  PortfolioActionsSnapshot,
  PortfolioResolveResult,
} from "./portfolio-actions";

/** Translate a resolveEventAction failure reason into operator-facing text. The
 *  item stays pending; we never claim a failed external write succeeded. */
function failureMessage(reason?: string): string {
  switch (reason) {
    case "gbp_post_failed":
      return "Google post failed — still pending";
    case "gbp_hours_failed":
      return "Hours update failed — still pending";
    case "gbp_photo_failed":
      return "Photo upload failed — still pending";
    case "review_reply_failed":
      return "Reply publish failed — still pending";
    case "newsletter_failed":
    case "newsletter_invalid":
      return "Newsletter send failed — still pending";
    case "draft_not_found":
      return "Draft missing — still pending";
    case "stale_superseded":
      return "Superseded by a newer edit";
    case "already_resolved":
      return "Already handled elsewhere";
    case "not_found":
    case "wrong_tenant":
      return "No longer available";
    default:
      return "Couldn’t approve — still pending";
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

  const approveAll = useCallback(
    () => resolve(groups.flatMap((g) => g.items)),
    [groups, resolve],
  );

  const anyProcessing = processing.size > 0;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-[28px] sm:text-[32px] font-medium text-warm-white">
            Portfolio actions
          </h1>
          <p className="mt-1 text-sm text-gray-muted">
            {totalItems > 0
              ? `${totalItems} item${totalItems === 1 ? "" : "s"} across ${groups.length} client${
                  groups.length === 1 ? "" : "s"
                } waiting for you`
              : "Nothing waiting across the portfolio. New drafts and approvals land here."}
          </p>
        </div>
        {totalItems > 0 && (
          <button
            type="button"
            onClick={approveAll}
            disabled={anyProcessing}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent transition-colors hover:bg-accent/90 disabled:opacity-50"
          >
            {anyProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
            ) : (
              <Check className="h-4 w-4" strokeWidth={2} />
            )}
            Approve all {totalItems}
          </button>
        )}
      </div>

      {totalItems === 0 ? (
        <div className="rounded-xl border border-glass-border bg-glass px-5 py-10 text-center">
          <p className="text-sm text-emerald-300">Portfolio is clear.</p>
          <Link href="/admin" className="mt-2 inline-block text-xs text-accent hover:underline">
            Back to overview →
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
                              <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-300">
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
                              onClick={() => resolve([item])}
                              disabled={anyProcessing}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-bg px-2.5 py-1.5 text-[12px] font-medium text-gray-fg transition-colors hover:bg-success hover:text-white disabled:opacity-50"
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
                    Showing the first {group.items.length}. More may be waiting — approve these,
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
