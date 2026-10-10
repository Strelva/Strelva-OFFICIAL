"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StCopy, StEmpty, StMono, StNotice, StPill, StRow, StRows, StSection, StState, StTextButton } from "@/components/ui/strelva/Kit";
import { hasQueueEventDetail } from "@/components/dashboard/QueueEventDetail";
import { DraftChangePreview } from "../drafts/DraftChangePreview";
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

export function PortfolioActionsClient({ snapshot, resolveActions = resolvePortfolioActions, escalateActions = escalatePortfolioActions }: { snapshot: PortfolioActionsSnapshot; resolveActions?: typeof resolvePortfolioActions; escalateActions?: typeof escalatePortfolioActions }) {
  const router = useRouter();
  const [actionError, setActionError] = useState("");
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
      setActionError("");
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
          const res = await resolveActions(
            items.map((i) => ({ tenantId: i.tenantId, eventId: i.id })),
          );
          if (res.ok) applyResults(res.results);
          else setActionError("Operator permission could not be confirmed. These approvals are still waiting.");
        } catch {
          setActionError("The approval result could not be read. Refresh before trying again; these items have not been marked approved here.");
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
    [applyResults, router, resolveActions],
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
      setActionError("");
      setProcessing((prev) => new Set(prev).add(item.id));
      startTransition(async () => {
        try {
          const res = await escalateActions([{ tenantId: item.tenantId, eventId: item.id }]);
          if (res.ok && res.results[0]?.changed) {
            setGroups((prev) =>
              prev.map((g) => ({ ...g, items: g.items.filter((it) => it.id !== item.id) })).filter((g) => g.items.length > 0),
            );
          } else {
            setActionError(res.ok ? "The draft could not be handed to the client. It is still waiting here." : "Operator permission could not be confirmed. The draft is still waiting here.");
          }
        } catch {
          setActionError("The handoff result could not be read. Refresh before trying again.");
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
    [router, escalateActions],
  );

  const anyProcessing = processing.size > 0;
  const readsIncomplete = snapshot.incomplete.length > 0;

  return (
    <StSection title="Waiting for approval" meta={<StMono>{totalItems} items · {groups.length} clients</StMono>} action={totalItems > 0 ? <StPill onClick={approveAll} disabled={anyProcessing} busy={anyProcessing}>{confirmApproveAll ? `Confirm — publish ${totalItems} across all clients?` : `Approve all ${totalItems}`}</StPill> : undefined}>
      {actionError && <StNotice tone="critical">{actionError}</StNotice>}
      {readsIncomplete && <StNotice tone="need" action={<StTextButton href="/admin/actions">Retry reads</StTextButton>}><strong>This portfolio view is incomplete.</strong> {incompleteReadMessage(snapshot)}</StNotice>}
      {totalItems === 0 ? <StEmpty action={<StTextButton href={readsIncomplete ? "/admin/actions" : "/admin"}>{readsIncomplete ? "Retry reads" : "Back to overview"}</StTextButton>}><StState kind={readsIncomplete ? "need" : "live"}>{readsIncomplete ? "No verified approvals to display yet" : "Portfolio is clear"}</StState><StCopy muted>{readsIncomplete ? "The reads that completed returned no items. Retry before treating the portfolio as clear." : "Nothing across any client needs approval right now."}</StCopy></StEmpty> : groups.map(group => {
        const groupBusy = group.items.some(it => processing.has(it.id));
        return <StSection key={group.tenantId} title={<StTextButton href={`/admin/clients/${group.tenantId}`}>{group.siteName}</StTextButton>} meta={<StMono>{group.items.length}</StMono>} action={<StPill variant="soft" onClick={() => resolve(group.items)} disabled={anyProcessing} busy={groupBusy}>Approve all</StPill>}>
          <StRows label={`Approvals for ${group.siteName}`}>{group.items.map(item => {
            const state = itemState[item.id];
            const busy = processing.has(item.id);
            const hasDetail = hasQueueEventDetail(item);
            const isOpen = expanded.has(item.id);
            return <StRow key={item.id} kind={item.label} title={item.title} align="start" detail={state?.failed ? <span role="alert"><StState kind="need">{state.message}</StState></span> : undefined} end={<div className="flex flex-wrap items-center gap-2">{hasDetail && <StTextButton onClick={() => toggleExpanded(item.id)} aria-expanded={isOpen}>{isOpen ? "Hide" : "Review"}</StTextButton>}<StTextButton onClick={() => escalate(item)} disabled={anyProcessing} title="Hand this to the client to decide">Ask client</StTextButton><StPill variant="soft" onClick={() => resolve([item])} disabled={anyProcessing} busy={busy}>Approve</StPill></div>}>
              {hasDetail && isOpen && <div className="flex flex-col gap-3 pt-4"><DraftChangePreview event={{ type: item.type, metadata: item.metadata }} /></div>}
            </StRow>;
          })}</StRows>
          {group.capped && <StCopy muted>Showing the first <StMono>{group.items.length}</StMono>. More may be waiting. Approve these, then refresh.</StCopy>}
        </StSection>;
      })}
    </StSection>
  );
}
