"use client";

import { useCallback, useEffect, useState } from "react";
import { StEmpty, StMono, StNotice, StPill, StRow, StRows, StSection, StSkeleton, StState, StSurface, StTextButton, StToast } from "@/components/ui/strelva/Kit";
import { SelectInput, TextInput } from "@/components/ui/TextInput";
import type { PayerTransition, PayerTransitionSnapshot } from "@/platform/work-economics/payer-transitions";

/** Who would pay: a person, an agency, or the business itself. */
function successorLabel(item: PayerTransition): string {
  if (item.successorKind === "agency") return `${item.successorWorkspaceName ?? "An agency"} (agency)`;
  if (item.successorKind === "business") return "This business";
  return item.successorEmail;
}

export function WorkspacePayerTransition({ workspaceId, canPropose, agencyChoices = [], providerChangeEnabled = false, request = fetch }: { workspaceId: string; canPropose: boolean; agencyChoices?: { id: string; name: string }[]; providerChangeEnabled?: boolean; request?: typeof fetch }) {
  const [data, setData] = useState<PayerTransitionSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [successorKind, setSuccessorKind] = useState("business");
  const [successorAgencyWorkspaceId, setSuccessorAgencyWorkspaceId] = useState("");
  const [providerChange, setProviderChange] = useState<{ id: string; status: string } | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setError("");
    try {
      const response = await request(`/api/work-economics/payer-transition?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store", signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Payer history could not be loaded.");
      setData(body);
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "Payer history could not be loaded.");
    }
  }, [workspaceId, request]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  async function command(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await request("/api/work-economics/payer-transition", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The payer change could not be confirmed.");
      setData(result);
      if (body.action === "accept") setProviderChange(null);
      const resolved = typeof body.transitionId === "string" ? result.transitions?.find((item: { id: string }) => item.id === body.transitionId) : null;
      setNotice(body.action === "accept" && resolved?.status === "stale" ? "This proposal became stale because its proposer is no longer a business owner." : body.action === "accept" ? "You accepted responsibility for future jobs." : body.action === "reject" ? "You declined this payer change." : body.action === "revoke" ? "The pending payer change was revoked." : "Payer change proposed. An authorized representative of the proposed payer must accept it.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The payer change could not be confirmed."); }
    finally { setBusy(false); }
  }

  async function requestProviderChange(complete = false) {
    const current = data?.current;
    if (busy || !current || current.status !== "accepted" || current.successorKind === "user") return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await request("/api/workspace/provider-change", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(complete && providerChange ? { action: "complete", requestId: providerChange.id } : { action: "request", workspaceId, agencyWorkspaceId: current.successorKind === "agency" ? current.successorWorkspaceId : null, payerTransitionId: current.id, idempotencyKey: `provider-payer:${current.id}` }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The agency handoff could not be confirmed.");
      setProviderChange(result);
      setNotice(result.status === "completed" ? "The agency handoff is complete. Existing sites and financial records are preserved." : result.status === "awaiting_policy" ? "Your handoff request is saved. The provider response policy must be approved before it can proceed." : "Your handoff request is saved. The outgoing provider must receive the notice and response window before completion.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The agency handoff could not be confirmed."); }
    finally { setBusy(false); }
  }

  const pending = data?.pending;
  const addressed = Boolean(pending && (pending.canRespond || pending.successorUserId === data?.currentActorId));
  return <StSection title="Payer for future jobs" id="payer-transition-heading">
    <p className="text-sm text-gray-muted">An accepted change applies only to jobs created afterward. Existing budgets, reservations, recorded costs, and unresolved holds keep their original payer and limit.</p>
    {error ? <StNotice tone="critical">{error}<StTextButton disabled={busy} onClick={() => void load()}>Retry payer history</StTextButton></StNotice> : null}
    {notice ? <StToast>{notice}</StToast> : null}
    {!data && !error ? <StSkeleton label="Loading payer history" /> : null}
    {data?.current ? <StRows><StRow kind="Current accepted successor" title={successorLabel(data.current)} detail={<>Since <StMono>{new Date(data.current.acceptedAt!).toLocaleString()}</StMono></>} /></StRows> : data ? <StEmpty>No successor payer has been accepted for future jobs.</StEmpty> : null}
    {providerChangeEnabled && canPropose && data?.current && data.current.successorKind !== "user" ? <StNotice><p>Use this accepted payer for the agency handoff. The server rechecks the business owner and accepted payer’s current authority. The request preserves existing sites and agreements; new subscription prices and any proration need separate approval.</p><StPill variant="soft" disabled={busy || providerChange?.status === "completed"} onClick={() => void requestProviderChange(providerChange?.status === "notified")}>{providerChange?.status === "completed" ? "Agency handoff complete" : providerChange?.status === "notified" ? "Complete after the provider response window" : "Request agency handoff"}</StPill></StNotice> : null}
    {pending ? <StSurface tone="need" label="Pending payer change"><StState kind="need">Pending · {successorLabel(pending)}</StState><p className="mt-2 text-sm text-gray-muted">Proposed by {pending.proposerEmail}. {pending.successorKind === "agency" ? "Only an owner or admin of this agency can accept." : pending.successorKind === "business" ? "A business owner accepts." : "Only this addressed verified person can accept."}</p>
      <div className="mt-3 flex flex-wrap gap-2">{addressed ? <><StPill disabled={busy} onClick={() => void command({ action: "accept", transitionId: pending.id })}>Accept future payer role</StPill><StTextButton disabled={busy} onClick={() => void command({ action: "reject", transitionId: pending.id })}>Decline</StTextButton></> : null}{canPropose ? <StTextButton disabled={busy} onClick={() => void command({ action: "revoke", transitionId: pending.id })}>Revoke proposal</StTextButton> : null}</div>
    </StSurface> : canPropose && data ? <StSurface label="Propose a payer change"><form className="max-w-md space-y-3" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void command(successorKind === "agency" ? { action: "propose", workspaceId, successorAgencyWorkspaceId: form.get("successorAgencyWorkspaceId") } : successorKind === "business" ? { action: "propose", workspaceId, successorKind: "business" } : { action: "propose", workspaceId, successorEmail: form.get("successorEmail") }); }}>
      <SelectInput label="Who pays for future jobs?" value={successorKind} onChange={event => setSuccessorKind(event.target.value)} options={[{ value: "business", label: "This business" }, { value: "agency", label: "An agency" }, { value: "user", label: "A named business signer" }]} />
      {successorKind === "agency" ? <><SelectInput label="Agency" name="successorAgencyWorkspaceId" value={successorAgencyWorkspaceId} onChange={event => setSuccessorAgencyWorkspaceId(event.target.value)} options={[{ value: "", label: "Choose an accessible agency" }, ...agencyChoices.map(agency => ({ value: agency.id, label: agency.name }))]} disabled={busy || !agencyChoices.length} required helperText="An owner or admin of this agency must accept in their account." />{!agencyChoices.length ? <StEmpty>No agency is available to your account. Ask its owner for an invitation before choosing it as payer.</StEmpty> : null}</> : successorKind === "user" ? <TextInput label="Verified payer email" name="successorEmail" type="email" maxLength={254} required /> : <p className="text-sm text-gray-muted">A business owner accepts this change. Existing job limits and billing agreements are preserved.</p>}
      <StPill variant="soft" type="submit" disabled={busy || (successorKind === "agency" && !successorAgencyWorkspaceId)}>Propose new payer</StPill>
    </form></StSurface> : !canPropose && data && !pending ? <StNotice>Only a business owner can propose a new payer.</StNotice> : null}
    {data?.transitions.length ? <details><summary className="cursor-pointer text-sm">Payer change history</summary><StRows>{data.transitions.map(item => <StRow key={item.id} title={`${item.status} · ${successorLabel(item)}`} detail={<>Proposed <StMono>{new Date(item.proposedAt).toLocaleString()}</StMono></>} />)}</StRows></details> : null}
  </StSection>;
}
