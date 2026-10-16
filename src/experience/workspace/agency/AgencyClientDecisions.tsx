"use client";

import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { StEmpty, StNotice, StPill, StRow, StRows, StSection, StTextButton } from "@/components/ui/strelva/Kit";
import { XaTextLink, XaYes } from "@/components/ui/strelva/Xa";
import { XA_YES_LABELS } from "@/platform/presentation/place-labels";
import { ownerDecisionSchema, type OwnerDecision } from "@/platform/needs-you/contracts";
import { actorCopy, actorLabel } from "@/platform/presentation/actor";
import { useWorkspaceRequest } from "../WorkspaceRequest";

const pageSchema = z.object({ authority: z.literal("agency"), agencyWorkspaceId: z.string().uuid(), canDecide: z.literal(true), items: z.array(ownerDecisionSchema), complete: z.boolean() });
type State = { status: "loading" } | { status: "error" } | { status: "permission" } | { status: "disabled" } | { status: "ready"; items: OwnerDecision[]; complete: boolean };
const outcomes: Record<string, string> = {
  done: "Done.", done_unverified: "Done. Confirmation is still pending.", already_handled: "This was already handled.",
  changed: "This changed. Review the latest before deciding.", expired: "This decision expired.",
  failed: "The work could not finish. Check its status before preparing another decision.",
  forbidden: "Your agency cannot decide this under its current access.", not_owner: "Only the owner can decide this.",
  not_found: "This is no longer waiting.", sign_in: "Sign in again to decide this.",
};

export function agencyDecisionVerb(item: OwnerDecision) {
  return item.sourceLifecycle.includes("booking") && item.kind === "customer.commitment" ? XA_YES_LABELS.confirm : XA_YES_LABELS.yes;
}

/** A Full-control grant is projected per item, never inferred from a broad agency role. */
export function AgencyDecisionRows({ items, busy, onDecide }: { items: OwnerDecision[]; busy: boolean; onDecide: (item: OwnerDecision, decision: "approve" | "not_yet") => void }) {
  return <StRows label="Decisions your agency can make">{items.map(item => {
    const label = agencyDecisionVerb(item);
    return <StRow key={item.id} align="start" title={item.title} detail={actorLabel(item.actor)} end={<div className="flex flex-wrap items-center gap-3">
      {item.openHref?.startsWith("/") ? <StTextButton href={item.openHref}>Open preview</StTextButton> : null}
      <XaYes state={busy ? "going" : "waiting"} block={false} shortcut={items.length === 1} yesLabel={label} yesAriaLabel={`${label}: ${item.title}`} notYetAriaLabel={`Not yet: ${item.title}`}
        disabledReason={item.review === null ? "The exact changes could not be loaded. Refresh before deciding." : undefined} unblock={<XaTextLink onClick={() => window.location.reload()}>Refresh</XaTextLink>} disabled={busy} working={{ title: "Working…", steps: [] }}
        onYes={() => onDecide(item, "approve")} onNotYet={item.review === null ? undefined : () => onDecide(item, "not_yet")} />
    </div>}>
      {item.review?.length ? <ul aria-label="Every change you approve" className="space-y-1">{item.review.map((line, index) => <li key={index} className="whitespace-pre-wrap break-words">{line}</li>)}</ul> : item.detail ? <p>{item.detail}</p> : null}
      <p className="text-sm text-gray-muted">{label}: {actorCopy(item.approveEffect, item.actor)} Not yet: {actorCopy(item.notYetEffect, item.actor)}</p>
    </StRow>;
  })}</StRows>;
}

export function AgencyClientDecisions({ workspaceId, agencyWorkspaceId, clientName, request: suppliedRequest }: { workspaceId: string; agencyWorkspaceId: string; clientName: string; request?: typeof fetch }) {
  const ownedRequest = useWorkspaceRequest();
  const request = suppliedRequest ?? ownedRequest;
  const [state, setState] = useState<State>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [recordedOutcome, setRecordedOutcome] = useState<OwnerDecision | null>(null);
  const pendingOutcome = useRef<OwnerDecision | null>(null);
  const locked = useRef(false);
  const sequence = useRef(0);
  const mounted = useRef(false);

  async function load() {
    const read = ++sequence.current;
    setState({ status: "loading" });
    try {
      if (pendingOutcome.current) {
        const exact = pendingOutcome.current;
        const receiptResponse = await request(`/api/workspace/needs-you?${new URLSearchParams({ workspaceId, agencyWorkspaceId, asAgency: "1", itemId: exact.id, revision: exact.revisionHash })}`, { cache: "no-store", credentials: "same-origin" });
        if (read !== sequence.current || !mounted.current) return;
        if (receiptResponse.status === 401 || receiptResponse.status === 403 || receiptResponse.status === 404) { setState({ status: "permission" }); return; }
        if (!receiptResponse.ok) throw new Error("outcome unavailable");
        const receipt = z.object({ authority: z.literal("agency"), agencyWorkspaceId: z.string().uuid(), item: ownerDecisionSchema }).parse(await receiptResponse.json());
        if (receipt.agencyWorkspaceId !== agencyWorkspaceId || receipt.item.workspaceId !== workspaceId || receipt.item.id !== exact.id || receipt.item.revisionHash !== exact.revisionHash) throw new Error("outcome scope");
        if (read !== sequence.current || !mounted.current) return;
        setRecordedOutcome(receipt.item);
        setNotice(null);
        pendingOutcome.current = null;
      }
      const response = await request(`/api/workspace/needs-you?${new URLSearchParams({ workspaceId, asAgency: "1", agencyWorkspaceId })}`, { cache: "no-store", credentials: "same-origin" });
      if (read !== sequence.current || !mounted.current) return;
      if (response.status === 401 || response.status === 403 || response.status === 404) { setState({ status: "permission" }); return; }
      if (response.status === 503) { setState({ status: "disabled" }); return; }
      if (!response.ok) throw new Error("unavailable");
      const page = pageSchema.parse(await response.json());
      if (page.agencyWorkspaceId !== agencyWorkspaceId) throw new Error("agency scope");
      if (page.items.some(item => item.workspaceId !== workspaceId || item.state !== "open" || item.route !== "owner_decides")) throw new Error("scope");
      if (read === sequence.current && mounted.current) setState({ status: "ready", items: page.items, complete: page.complete });
    } catch {
      if (read === sequence.current && mounted.current) setState({ status: "error" });
    }
  }
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; sequence.current += 1; };
    // The panel is keyed by its client; all in-flight reads are discarded on exit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, agencyWorkspaceId, request]);

  async function decide(item: OwnerDecision, decision: "approve" | "not_yet") {
    if (locked.current || state.status !== "ready" || item.review === null || !state.items.some(row => row.id === item.id && row.revisionHash === item.revisionHash)) return;
    locked.current = true;
    setBusy(true);
    setNotice(null);
    setRecordedOutcome(null);
    try {
      const response = await request("/api/workspace/needs-you", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, agencyWorkspaceId, itemId: item.id, revision: item.revisionHash, decision, asAgency: true }) });
      const body = z.object({ status: z.string() }).parse(await response.json());
      if (!outcomes[body.status]) throw new Error("unconfirmed");
      if (mounted.current) setNotice(decision === "not_yet" && body.status === "done" ? "Not yet. Nothing changed." : outcomes[body.status]!);
    } catch {
      pendingOutcome.current = item;
      if (mounted.current) setNotice("Outcome not confirmed. Checking the current decision before you can try again.");
    } finally {
      // Any lost or malformed response is reconciled before controls return.
      if (mounted.current) await load();
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return <StSection title={`Decisions for ${clientName}`} action={<StTextButton disabled={busy} onClick={() => void load()}>Refresh decisions</StTextButton>}>
    <p className="text-sm text-gray-muted">Your agency decides within its Full-control areas. Website publishing and domain changes also require current publishing verification and the owner’s permission for that resource. Possibilities, payer, exit, access and private business details stay with the owner.</p>
    {notice ? <p role="status">{notice}</p> : null}
    {recordedOutcome ? <StNotice>
      <p>{recordedOutcome.title}: {recordedOutcome.state === "open" ? "No decision is recorded. Review the current changes before trying again."
        : recordedOutcome.state === "approved" || recordedOutcome.state === "declined"
          ? recordedOutcome.outcome === null ? "The decision is recorded. Its outcome is still pending; do not submit it again."
            : recordedOutcome.outcome === "done_unverified" ? "The action was accepted. Confirmation is still pending."
              : recordedOutcome.outcome === "failed" ? "The decision is recorded, but the work could not finish." : recordedOutcome.state === "declined" ? "Not yet was recorded." : "Done."
          : "This review is no longer open."}</p>
      {recordedOutcome.decidedActor ? <p>{actorLabel(recordedOutcome.decidedActor)}</p> : null}
      {recordedOutcome.outcomeReason ? <p>{recordedOutcome.outcomeReason}</p> : null}
      <StTextButton disabled={busy || state.status === "loading"} onClick={() => { pendingOutcome.current = recordedOutcome; void load(); }}>Check recorded outcome</StTextButton>
    </StNotice> : null}
    {state.status === "loading" ? <p role="status">Checking your current decision access…</p>
      : state.status === "permission" ? <StNotice>Your agency cannot open decisions for this client. Check the client assignment with your agency owner or return to Clients.</StNotice>
      : state.status === "disabled" ? <StNotice>Client decisions are currently unavailable. Nothing was approved by opening this panel.</StNotice>
      : state.status === "error" ? <StNotice tone="critical">Decisions could not be checked. Approval controls stay unavailable. <StPill variant="soft" disabled={busy} onClick={() => void load()}>Check again</StPill></StNotice>
      : <>{!state.complete ? <StNotice>Some exact reviews could not be loaded. Those decisions stay unavailable.</StNotice> : null}{state.items.length ? <AgencyDecisionRows items={state.items} busy={busy} onDecide={(item, decision) => void decide(item, decision)} /> : <StEmpty>No open decisions are available within your agency’s Full-control areas.</StEmpty>}</>}
  </StSection>;
}
