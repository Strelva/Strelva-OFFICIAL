"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StCopy, StEmpty, StMono, StNotice, StPill, StRow, StRows, StSection, StState, StTextButton } from "@/components/ui/strelva/Kit";
import { draftPortfolioOpportunity } from "./actions";
import type {
  OpportunityGroup,
  OpportunityKind,
  PortfolioOpportunitiesSnapshot,
} from "./portfolio-opportunities";

/** Per-group result after a "Draft these" pass — what landed, what didn't. */
type GroupResult = { drafted: number; skipped: number; failed: number };

/** What each opportunity kind actually produces, in plain terms — so the
 *  operator knows what a button will draft before clicking it. */
const KIND_INFO: Record<OpportunityKind, { drafts: string; lands: string }> = {
  unreplied_reviews: { drafts: "a reply written in the client's voice", lands: "ready to approve in each client's queue" },
  stale_sites: { drafts: "a fresh post or update for the site", lands: "onto your work-list on each client's page" },
  low_health: { drafts: "the prioritized fixes for their site health", lands: "onto your work-list on each client's page" },
};

/** Reasons that are "nothing to do", not a failure, so we don't alarm the operator. */
const BENIGN_REASONS = new Set(["already_drafted", "no_unreplied_review", "nothing_to_draft"]);

function incompleteReadMessage(snapshot: PortfolioOpportunitiesSnapshot): string {
  if (snapshot.incomplete.some((read) => read.source === "client_directory")) {
    return "The client directory could not be read, so this opportunity scan is unavailable.";
  }

  const names = snapshot.incomplete
    .map((read) => read.siteName || read.tenantId)
    .filter((name): name is string => Boolean(name));
  const sourceLabels = Array.from(
    new Set(
      snapshot.incomplete.map((read) =>
        read.source === "site_health"
          ? "site health"
          : read.source === "reviews"
            ? "reviews"
            : "retention signals",
      ),
    ),
  );
  if (names.length > 0) {
    const shown = names.slice(0, 3).join(", ");
    const remainder = names.length - Math.min(names.length, 3);
    return remainder > 0
      ? `${sourceLabels.join(" and ")} could not be checked for ${shown} and ${remainder} more client${remainder === 1 ? "" : "s"}.`
      : `${sourceLabels.join(" and ")} could not be checked for ${shown}.`;
  }
  return `${sourceLabels.join(" and ")} could not be checked.`;
}

export function PortfolioOpportunitiesClient({
  snapshot, draftOpportunity = draftPortfolioOpportunity,
}: {
  snapshot: PortfolioOpportunitiesSnapshot;
  draftOpportunity?: typeof draftPortfolioOpportunity;
}) {
  const router = useRouter();
  const [actionError, setActionError] = useState("");
  const [processing, setProcessing] = useState<OpportunityKind | null>(null);
  const [results, setResults] = useState<Record<string, GroupResult>>({});
  const [, startTransition] = useTransition();

  const draftGroup = useCallback(
    (group: OpportunityGroup) => {
      setActionError("");
      setProcessing(group.kind);
      setResults((prev) => {
        const next = { ...prev };
        delete next[group.kind];
        return next;
      });
      startTransition(async () => {
        try {
          const res = await draftOpportunity(
            group.kind,
            group.clients.map((c) => c.tenantId),
          );
          if (res.ok) {
            const drafted = res.results.filter((r) => r.drafted).length;
            const failed = res.results.filter(
              (r) => !r.drafted && !BENIGN_REASONS.has(r.reason ?? ""),
            ).length;
            const skipped = res.results.length - drafted - failed;
            setResults((prev) => ({ ...prev, [group.kind]: { drafted, skipped, failed } }));
          } else {
            setActionError("Operator permission could not be confirmed. No draft has been confirmed here.");
          }
        } catch {
          setActionError("The drafting result could not be read. Refresh before trying again.");
        } finally {
          setProcessing(null);
          // Re-read server truth: drafted items now show in the queue below.
          router.refresh();
        }
      });
    },
    [router, draftOpportunity],
  );

  const readsIncomplete = snapshot.incomplete.length > 0;
  if (snapshot.totalOpportunities === 0 && !readsIncomplete) return null;

  return <StSection title="Ready to draft" meta={<StMono>{snapshot.totalOpportunities}</StMono>}>
    <StCopy muted>Strelva Agency prepares these changes for each client. Review and approve before anything goes live.</StCopy>
    {actionError && <StNotice tone="critical">{actionError}</StNotice>}
    {readsIncomplete && <StNotice tone="need" action={<StTextButton href="/admin/actions">Retry reads</StTextButton>}><strong>This opportunity scan is incomplete.</strong> {incompleteReadMessage(snapshot)}</StNotice>}
    {snapshot.totalOpportunities === 0 ? <StEmpty action={<StTextButton href="/admin/actions">Retry reads</StTextButton>}>No verified opportunities to display yet. The reads that completed returned no opportunities. Retry before treating the portfolio as clear.</StEmpty> : snapshot.groups.map(group => {
      const busy = processing === group.kind;
      const result = results[group.kind];
      return <StSection key={group.kind} title={group.title} meta={<StMono>{group.clients.length}</StMono>} action={<StPill variant="soft" onClick={() => draftGroup(group)} disabled={processing !== null} busy={busy} title={`Draft ${KIND_INFO[group.kind].drafts} for ${group.clients.length} clients — ${KIND_INFO[group.kind].lands}`}>{group.actionLabel}</StPill>}>
        <StCopy muted>{group.summary} Drafts {KIND_INFO[group.kind].drafts}, {KIND_INFO[group.kind].lands}.</StCopy>
        <StRows label={group.title}>{group.clients.map(client => <StRow key={client.tenantId} title={client.siteName} detail={client.detail} href={`/admin/clients/${client.tenantId}`} />)}</StRows>
        {result && <div role="status"><StCopy>{result.drafted > 0 ? `Strelva Agency drafted for ${result.drafted} of ${result.drafted + result.skipped + result.failed} clients, waiting for approval. ${result.skipped > 0 ? `${result.skipped} had nothing to draft or already had one.` : ""}` : "Nothing new to draft. These clients had nothing to draft or already have a pending draft."}</StCopy>{result.failed > 0 && <StState kind="need">{result.failed} clients couldn’t be drafted. Try again.</StState>}</div>}
      </StSection>;
    })}
  </StSection>;
}
