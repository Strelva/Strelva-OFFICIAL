"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { beginFocusRecovery, type FocusRecovery } from "@/experience/websites/focus-recovery";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SelectInput, TextInput } from "@/components/ui/TextInput";
import type { CreatorMaintenanceGraph } from "@/platform/connect/creator-maintenance";

// The existing wire receipt, validated without importing the server/db module.
const receiptSchema = z.object({
  id: z.uuid(), listing_id: z.uuid(), maintainer_state: z.enum(["creator", "takeover", "tapered"]),
  agreement_version: z.string().nullable(), rate_reference: z.string().nullable(),
  effective_from: z.string().datetime({ offset: true }), recorded_by: z.uuid(),
  recorded_at: z.string().datetime({ offset: true }),
}).strict();
const unknownMessage = "This maintenance change could not be confirmed. Reload its history before recording different terms.";

export default function CreatorMaintenance({ graph }: { graph: CreatorMaintenanceGraph }) {
  const router = useRouter();
  const active = useRef(true);
  const pending = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const blocked = useRef(false);
  const currentAuthority = useRef(graph.canMaintain);
  currentAuthority.current = graph.canMaintain;
  const submittedGraph = useRef<CreatorMaintenanceGraph | null>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const receiptRef = useRef<HTMLParagraphElement>(null);
  const reloadRef = useRef<HTMLButtonElement>(null);
  const focusRecovery = useRef<FocusRecovery | null>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; pending.current?.abort(); focusRecovery.current?.cancel(); }; }, []);
  const [listingId, setListingId] = useState("");
  const [state, setState] = useState("");
  const [agreementIndex, setAgreementIndex] = useState("");
  const [effective, setEffective] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const draftGraph = (busy || unconfirmed) && submittedGraph.current ? submittedGraph.current : graph;
  const listing = draftGraph.listings.find(item => item.id === listingId);
  const agreement = agreementIndex === "" ? undefined : draftGraph.agreements[Number(agreementIndex)];
  useEffect(() => {
    if (!focusRecovery.current || (busy && graph.canMaintain)) return;
    focusRecovery.current.recover(!graph.canMaintain ? historyRef.current : unconfirmed ? reloadRef.current : receipt ? receiptRef.current : errorRef.current, true);
    focusRecovery.current = null;
  }, [busy, error, receipt, unconfirmed, graph.canMaintain]);
  function changeDraft(change: () => void) {
    if (inFlight.current || blocked.current || !currentAuthority.current) return;
    submittedGraph.current = null;
    setError(null); setReceipt(null); change();
  }
  function invalidInput(message: string) {
    setError(message);
    // Repeated identical validation can leave React state unchanged.
    if (error === message && errorRef.current) {
      focusRecovery.current?.recover(errorRef.current, true);
      focusRecovery.current = null;
    }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current || blocked.current || !currentAuthority.current) return;
    focusRecovery.current?.cancel();
    focusRecovery.current = beginFocusRecovery(sectionRef.current);
    setError(null); setReceipt(null);
    if (!listing || !["creator", "takeover", "tapered"].includes(state)) { invalidInput("Choose a listing and maintenance state."); return; }
    const date = new Date(effective);
    if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) { invalidInput("Choose a future maintenance date."); return; }
    if (state !== "takeover" && (!agreement || date.getTime() < Date.parse(agreement.effectiveFrom) || (agreement.effectiveUntil && date.getTime() >= Date.parse(agreement.effectiveUntil)))) { invalidInput("Choose a recorded agreement covering this maintenance date."); return; }
    const command = { workspaceId: graph.workspaceId, listingId: listing.id, sourceRevisionId: listing.sourceRevisionId, state, effectiveFrom: date.toISOString(), ...(state !== "takeover" ? { agreementVersion: agreement!.version, rateReference: agreement!.rateReference } : {}) };
    inFlight.current = true;
    submittedGraph.current = graph;
    setBusy(true);
    const controller = new AbortController(); pending.current = controller;
    try {
      const result = await fetch("/api/workspace/creator-maintenance", { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) });
      const value: unknown = await result.json().catch(() => null);
      if (!active.current || controller.signal.aborted) return;
      if (!result.ok) {
        // These route refusals occur before mutation, or roll back the RPC.
        // A 503 or unrecognized response can follow a committed RPC receipt.
        const definitiveRefusal = [400, 401, 403, 409, 413, 415, 429].includes(result.status);
        if (!definitiveRefusal) { blocked.current = true; setUnconfirmed(true); setError(unknownMessage); }
        else {
          submittedGraph.current = null;
          const refusal = z.object({ error: z.string() }).safeParse(value);
          setError(refusal.success ? refusal.data.error : "Maintenance was not recorded. Check these terms before trying again.");
        }
        return;
      }
      const parsed = receiptSchema.safeParse(value);
      if (!parsed.success || parsed.data.listing_id !== command.listingId || parsed.data.maintainer_state !== command.state || parsed.data.agreement_version !== (command.agreementVersion ?? null) || parsed.data.rate_reference !== (command.rateReference ?? null) || Date.parse(parsed.data.effective_from) !== Date.parse(command.effectiveFrom)) {
        blocked.current = true; setUnconfirmed(true); setError(unknownMessage); return;
      }
      setReceipt(`Maintenance terms recorded for ${parsed.data.effective_from}. No payment or provider change was made.`);
      submittedGraph.current = null;
      router.refresh();
    } catch {
      if (active.current && !controller.signal.aborted) { blocked.current = true; setUnconfirmed(true); setError(unknownMessage); }
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
      if (pending.current === controller) pending.current = null;
    }
  }
  return <div ref={sectionRef} className="mt-8 grid gap-6">
    <Card padding="lg"><h2 ref={historyRef} tabIndex={-1} className="font-display text-xl">Recorded listings</h2>{graph.listings.length ? <ul className="mt-4 space-y-6">{graph.listings.map(item => <li key={item.id}><h3 className="font-medium">{item.definitionId}</h3><p className="mt-2 break-all text-sm text-gray-muted">Source revision: {item.sourceRevisionId}</p><p className="mt-2 text-sm">Initial maintenance: {item.maintainerState}. Agreement: {item.agreementVersion ?? "Not configured"}.</p>{item.history.length ? <ul className="mt-3 space-y-2 text-sm" aria-label={`Maintenance history for ${item.definitionId}`}>{item.history.map(entry => <li key={entry.id}>{entry.maintainer_state} · effective {entry.effective_from} · agreement {entry.agreement_version ?? "None"}</li>)}</ul> : <p className="mt-3 text-sm text-gray-muted">No later maintenance terms are recorded.</p>}</li>)}</ul> : <p className="mt-4">No creator royalty listing is recorded. Source qualification and a written agreement remain separate prerequisites.</p>}</Card>
    {graph.listings.length && graph.canMaintain ? <Card padding="lg"><h2 className="font-display text-xl">Record future maintenance terms</h2><p className="mt-4 text-sm text-gray-muted">Takeover ends this listing’s future creator eligibility. Creator and tapered states use an existing recorded agreement. This records royalty maintenance terms; it does not carry out a software handoff, create rates, or pay royalties.</p>{!draftGraph.agreements.length ? <p className="mt-4" role="status">No creator agreement is configured. A creator or tapered royalty cannot be selected until its written agreement and rate are recorded.</p> : null}<form onSubmit={save} className="mt-6 grid gap-4">
      <SelectInput label="Listing" required disabled={busy || unconfirmed} className="min-h-12" value={listingId} onChange={event => changeDraft(() => setListingId(event.target.value))} options={[{ value: "", label: "Choose a listing" }, ...draftGraph.listings.map(item => ({ value: item.id, label: item.definitionId }))]} />
      <SelectInput label="Maintenance state" required disabled={busy || unconfirmed} className="min-h-12" value={state} onChange={event => changeDraft(() => setState(event.target.value))} options={[{ value: "", label: "Choose a state" }, { value: "takeover", label: "Takeover — end future creator eligibility" }, ...(draftGraph.agreements.length ? [{ value: "creator", label: "Creator — recorded agreement" }, { value: "tapered", label: "Tapered — recorded agreement" }] : [])]} />
      {state && state !== "takeover" ? <SelectInput label="Recorded agreement" required disabled={busy || unconfirmed} className="min-h-12" value={agreementIndex} onChange={event => changeDraft(() => setAgreementIndex(event.target.value))} options={[{ value: "", label: "Choose an agreement" }, ...draftGraph.agreements.map((item, index) => ({ value: String(index), label: `${item.version} · ${item.rateBps / 100}% · ${item.rateReference}` }))]} /> : null}
      <TextInput label="Effective date and time" type="datetime-local" required disabled={busy || unconfirmed} className="min-h-12" value={effective} onChange={event => changeDraft(() => setEffective(event.target.value))} helperText="Your local time. Strelva records the exact UTC instant and checks the agreement again." />
      <Button type="submit" size="lg" disabled={busy || unconfirmed}>{busy ? "Recording…" : "Record maintenance terms"}</Button>
    </form></Card> : graph.listings.length ? <p role="status">Future maintenance changes are unavailable after workspace exit. Recorded history remains available.</p> : null}
    {error ? <p ref={errorRef} tabIndex={-1} role="alert">{error}</p> : null}
    {unconfirmed ? <div><Button ref={reloadRef} type="button" variant="secondary" size="lg" onClick={() => { if (!inFlight.current) window.location.reload(); }}>Reload maintenance history</Button></div> : null}
    {receipt ? <p ref={receiptRef} tabIndex={-1} role="status">{receipt}</p> : null}
  </div>;
}
