"use client";

import { useCallback, useEffect, useState } from "react";
import { StEmpty, StInput, StNotice, StPill, StRow, StRows, StSection, StSkeleton, StTextButton, StToggle } from "@/components/ui/strelva/Kit";
import { AGENCY_LEVEL_LABELS, AGENCY_SCOPE_LABELS, type AgencyLevel, type AgencyScope } from "@/platform/agency-directory/contract";

type Proposal = { businessWorkspaceId: string; businessName: string; consent: string; proposedAt: string; scopes: Array<{ scope: AgencyScope; level: AgencyLevel }> };
type Transport = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Businesses asking this agency in (ADR 0015), and whether the agency is
 * listed where businesses choose one. Nothing changes for a business until
 * an owner or admin of the agency accepts. Listing is opt-in and unranked.
 */
export function AgencyProposals({ agencyWorkspaceId, agencyName, canManage, transport = fetch }: { agencyWorkspaceId: string; agencyName: string; canManage: boolean; transport?: Transport }) {
  const [state, setState] = useState<{ loading: boolean; error: string; proposals: Proposal[] }>({ loading: canManage, error: "", proposals: [] });
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [listed, setListed] = useState(false);
  const [summary, setSummary] = useState("");

  const load = useCallback(async () => {
    if (!canManage) return;
    try {
      const response = await transport(`/api/workspace/agency-proposals?${new URLSearchParams({ agencyId: agencyWorkspaceId })}`, { cache: "no-store" });
      const body = await response.json() as { proposals?: Proposal[]; listing?: { listed: boolean; summary: string }; error?: string };
      if (!response.ok) throw new Error(body.error || "Requests from businesses couldn't be loaded.");
      setState({ loading: false, error: "", proposals: body.proposals ?? [] });
      setListed(Boolean(body.listing?.listed));
      setSummary(current => current || body.listing?.summary || "");
    } catch (cause) {
      setState({ loading: false, error: cause instanceof Error ? cause.message : "Requests from businesses couldn't be loaded.", proposals: [] });
    }
  }, [agencyWorkspaceId, canManage, transport]);
  useEffect(() => { void load(); }, [load]);

  async function post(path: string, body: Record<string, unknown>, key: string): Promise<boolean> {
    setBusy(key); setMessage("");
    try {
      const response = await transport(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "That couldn't be confirmed. Nothing changed.");
      return true;
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "That couldn't be confirmed. Nothing changed.");
      return false;
    } finally { setBusy(null); }
  }
  async function respond(proposal: Proposal, accept: boolean) {
    if (await post("/api/workspace/agency-proposals", { agencyId: agencyWorkspaceId, businessId: proposal.businessWorkspaceId, accept }, proposal.businessWorkspaceId)) {
      setState(current => ({ ...current, proposals: current.proposals.filter(item => item.businessWorkspaceId !== proposal.businessWorkspaceId) }));
      setMessage(accept ? `${proposal.businessName} is now a client. Assign someone from Team to work on it.` : `You declined ${proposal.businessName}. Nothing changed for them.`);
    }
  }
  async function saveListing(next: boolean) {
    if (await post("/api/workspace/agency-directory-listing", { agencyId: agencyWorkspaceId, listed: next, summary: next ? summary.trim() : null }, "listing")) {
      setListed(next);
      setMessage(next ? `${agencyName} is listed where businesses bring in an agency.` : `${agencyName} is no longer listed. Current clients keep working with you.`);
    }
  }

  if (!canManage) return null;
  return <>
    <StSection title="Businesses asking you in" meta="A business chose what you can do. Nothing changes for them until you accept.">
      {state.loading ? <><p role="status">Loading requests from businesses…</p><StSkeleton label="Loading requests from businesses" /></>
        : state.error ? <StNotice tone="critical" action={<StTextButton onClick={() => void load()}>Try again</StTextButton>}>{state.error}</StNotice>
          : state.proposals.length ? <StRows label="Businesses asking you in">{state.proposals.map(proposal => <StRow key={proposal.businessWorkspaceId} title={proposal.businessName}
            detail={proposal.scopes.map(item => `${AGENCY_SCOPE_LABELS[item.scope]} · ${AGENCY_LEVEL_LABELS[item.level]}`).join(", ")}
            end={<span className="flex gap-2"><StPill busy={busy === proposal.businessWorkspaceId} disabled={Boolean(busy)} onClick={() => void respond(proposal, true)}>Accept</StPill><StTextButton disabled={Boolean(busy)} onClick={() => void respond(proposal, false)}>Decline</StTextButton></span>}>
            <small className="block text-xs text-gray-muted">{proposal.consent}</small>
          </StRow>)}</StRows>
            : <StEmpty>No businesses are waiting on you.</StEmpty>}
    </StSection>
    <StSection title="Your listing" meta="Businesses bring in agencies from one list, in name order. Strelva Agency is listed the same way.">
      <StInput label="What your agency does" hint="One line, shown next to your name." maxLength={280} value={summary} onChange={event => setSummary(event.target.value)} />
      <StToggle label={`List ${agencyName}`} checked={listed} disabled={busy === "listing" || (!listed && !summary.trim())} reason={!summary.trim() ? "Add one line first." : undefined} onChange={next => void saveListing(next)} />
    </StSection>
    {message ? <p role="status">{message}</p> : null}
  </>;
}
