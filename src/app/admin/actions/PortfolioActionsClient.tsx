"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StCopy, StEmpty, StMono, StNotice, StRow, StRows, StSection, StState, StTextButton } from "@/components/ui/strelva/Kit";
import { hasQueueEventDetail } from "@/components/dashboard/QueueEventDetail";
import { DraftChangePreview } from "../drafts/DraftChangePreview";
import { resolvePortfolioActions, escalatePortfolioActions } from "./actions";
import type { PortfolioActionItem, PortfolioActionsSnapshot } from "./portfolio-actions";

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

/** Operators inspect and route pending work to its owner; they never approve it. */
export function PortfolioActionsClient({ snapshot, escalateActions = escalatePortfolioActions }: { snapshot: PortfolioActionsSnapshot; resolveActions?: typeof resolvePortfolioActions; escalateActions?: typeof escalatePortfolioActions }) {
  const router = useRouter();
  const [groups, setGroups] = useState(snapshot.groups);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const totalItems = groups.reduce((sum, group) => sum + group.items.length, 0);
  const readsIncomplete = snapshot.incomplete.length > 0;
  function escalate(item: PortfolioActionItem) {
    setError("");
    startTransition(async () => {
      try {
        const result = await escalateActions([{ tenantId: item.tenantId, eventId: item.id }]);
        if (result.ok && result.results[0]?.changed) setGroups(current => current.map(group => ({ ...group, items: group.items.filter(row => row.id !== item.id) })).filter(group => group.items.length > 0));
        else setError("The owner handoff could not be confirmed. The draft is still waiting here.");
      } catch { setError("The handoff result could not be read. Refresh before trying again."); }
      finally { router.refresh(); }
    });
  }
  return <StSection title="Waiting for owner review" meta={<StMono>{totalItems} items · {groups.length} clients</StMono>}>
    <StCopy muted>Platform support inspects and routes client work. The business owner decides what goes live.</StCopy>
    {error && <StNotice tone="critical">{error}</StNotice>}
    {readsIncomplete && <StNotice tone="need" action={<StTextButton href="/admin/actions">Retry reads</StTextButton>}><strong>This portfolio view is incomplete.</strong> {incompleteReadMessage(snapshot)}</StNotice>}
    {totalItems === 0 ? <StEmpty><StState kind={readsIncomplete ? "need" : "live"}>{readsIncomplete ? "No verified approvals to display yet" : "No pending drafts"}</StState><StCopy muted>{readsIncomplete ? "The reads that completed returned no items. Retry before treating the portfolio as clear." : "No pending client drafts were found."}</StCopy></StEmpty> : groups.map(group => <StSection key={group.tenantId} title={<StTextButton href={`/admin/clients/${encodeURIComponent(group.tenantId)}`}>{group.siteName}</StTextButton>} meta={<StMono>{group.items.length}</StMono>}>
      <StRows label={`Pending drafts for ${group.siteName}`}>{group.items.map(item => {
        const hasDetail = hasQueueEventDetail(item);
        const isOpen = expanded.has(item.id);
        return <StRow key={item.id} kind={item.label} title={item.title} align="start" end={<div className="flex flex-wrap items-center gap-2">
          {hasDetail && <StTextButton onClick={() => setExpanded(current => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })} aria-expanded={isOpen}>{isOpen ? "Hide" : "Inspect"}</StTextButton>}
          <StTextButton onClick={() => escalate(item)} disabled={pending}>Ask the owner</StTextButton>
          <StTextButton href="/workspace">Open business workspace</StTextButton>
        </div>}>
          {hasDetail && isOpen && <div className="flex flex-col gap-3 pt-4"><DraftChangePreview event={{ type: item.type, metadata: item.metadata }} /></div>}
        </StRow>;
      })}</StRows>
      {group.capped && <StCopy muted>Showing the first <StMono>{group.items.length}</StMono>. More may be waiting. Refresh to read the latest.</StCopy>}
    </StSection>)}
  </StSection>;
}
