"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
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
      if (!response.ok) throw new Error(result.error ?? "The provider handoff could not be confirmed.");
      setProviderChange(result);
      setNotice(result.status === "completed" ? "The provider handoff is complete. Existing sites and financial records are preserved." : result.status === "awaiting_policy" ? "Your handoff request is saved. The provider response policy must be approved before it can proceed." : "Your handoff request is saved. The outgoing provider must receive the notice and response window before completion.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The provider handoff could not be confirmed."); }
    finally { setBusy(false); }
  }

  const pending = data?.pending;
  const addressed = Boolean(pending && (pending.canRespond || pending.successorUserId === data?.currentActorId));
  return <section className="mt-7 space-y-4" aria-labelledby="payer-transition-heading" aria-busy={busy}>
    <div><h3 id="payer-transition-heading" className="text-sm font-medium text-warm-black">Payer for future jobs</h3>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-muted">An accepted change applies only to jobs created afterward. Existing budgets, reservations, recorded costs, and unresolved holds keep their original payer and limit.</p></div>
    {error ? <div className="space-y-3"><p role="alert" className="text-sm text-critical">{error}</p><Button variant="secondary" disabled={busy} onClick={() => void load()}>Retry payer history</Button></div> : null}
    {notice ? <p role="status" className="text-sm text-positive">{notice}</p> : null}
    {!data && !error ? <p role="status" className="text-sm text-gray-muted">Loading payer history…</p> : null}
    {data?.current ? <p className="text-sm"><strong>Current accepted successor:</strong> {successorLabel(data.current)} <span className="text-gray-muted">since {new Date(data.current.acceptedAt!).toLocaleString()}</span></p> : data ? <p className="text-sm text-gray-muted">No successor payer has been accepted for future jobs.</p> : null}
    {providerChangeEnabled && canPropose && data?.current && data.current.successorKind !== "user" ? <div className="space-y-3 rounded-xl border border-gray-border p-4"><p className="text-sm text-gray-muted">Use this accepted payer for the provider handoff. The server rechecks the business owner and accepted payer’s current authority. The request preserves existing sites and agreements; new subscription prices and any proration need separate approval.</p><Button variant="secondary" disabled={busy || providerChange?.status === "completed"} onClick={() => void requestProviderChange(providerChange?.status === "notified")}>{providerChange?.status === "completed" ? "Provider handoff complete" : providerChange?.status === "notified" ? "Complete after the provider response window" : "Request provider handoff"}</Button></div> : null}
    {pending ? <div className="rounded-xl border border-gray-border bg-surface-inset p-4 text-sm"><p><strong>Pending:</strong> {successorLabel(pending)}</p><p className="mt-1 text-gray-muted">Proposed by {pending.proposerEmail}. {pending.successorKind === "agency" ? "Only an owner or admin of this agency can accept." : pending.successorKind === "business" ? "A business owner accepts." : "Only this addressed verified person can accept."}</p>
      <div className="mt-3 flex flex-wrap gap-2">{addressed ? <><Button disabled={busy} onClick={() => void command({ action: "accept", transitionId: pending.id })}>Accept future payer role</Button><Button variant="secondary" disabled={busy} onClick={() => void command({ action: "reject", transitionId: pending.id })}>Decline</Button></> : null}{canPropose ? <Button variant="secondary" disabled={busy} onClick={() => void command({ action: "revoke", transitionId: pending.id })}>Revoke proposal</Button> : null}</div>
    </div> : canPropose && data ? <form className="max-w-md space-y-3" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void command(successorKind === "agency" ? { action: "propose", workspaceId, successorAgencyWorkspaceId: form.get("successorAgencyWorkspaceId") } : successorKind === "business" ? { action: "propose", workspaceId, successorKind: "business" } : { action: "propose", workspaceId, successorEmail: form.get("successorEmail") }); }}>
      <SelectInput label="Who pays for future jobs?" value={successorKind} onChange={event => setSuccessorKind(event.target.value)} options={[{ value: "business", label: "This business" }, { value: "agency", label: "An agency" }, { value: "user", label: "A named business signer" }]} />
      {successorKind === "agency" ? <><SelectInput label="Agency" name="successorAgencyWorkspaceId" value={successorAgencyWorkspaceId} onChange={event => setSuccessorAgencyWorkspaceId(event.target.value)} options={[{ value: "", label: "Choose an accessible agency" }, ...agencyChoices.map(agency => ({ value: agency.id, label: agency.name }))]} disabled={busy || !agencyChoices.length} required helperText="An owner or admin of this agency must accept in their account." />{!agencyChoices.length ? <p className="text-sm text-gray-muted">No agency is available to your account. Ask its owner for an invitation before choosing it as payer.</p> : null}</> : successorKind === "user" ? <TextInput label="Verified payer email" name="successorEmail" type="email" maxLength={254} required /> : <p className="text-sm text-gray-muted">A business owner accepts this change. Existing job limits and billing agreements are preserved.</p>}
      <Button type="submit" disabled={busy || (successorKind === "agency" && !successorAgencyWorkspaceId)}>Propose new payer</Button>
    </form> : null}
    {data?.transitions.length ? <details><summary className="cursor-pointer text-sm">Payer change history</summary><ul className="mt-3 space-y-2 text-sm">{data.transitions.map(item => <li key={item.id} className="border-b border-gray-border pb-2"><span className="capitalize">{item.status}</span> · {successorLabel(item)}<span className="block text-xs text-gray-muted">Proposed {new Date(item.proposedAt).toLocaleString()}</span></li>)}</ul></details> : null}
  </section>;
}
