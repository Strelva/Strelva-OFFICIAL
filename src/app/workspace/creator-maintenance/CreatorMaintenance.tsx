"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SelectInput, TextInput } from "@/components/ui/TextInput";
import type { CreatorMaintenanceGraph } from "@/platform/connect/creator-maintenance";

export default function CreatorMaintenance({ graph }: { graph: CreatorMaintenanceGraph }) {
  const router = useRouter();
  const active = useRef(true);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; pending.current?.abort(); }; }, []);
  const [listingId, setListingId] = useState("");
  const [state, setState] = useState("");
  const [agreementIndex, setAgreementIndex] = useState("");
  const [effective, setEffective] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const listing = graph.listings.find(item => item.id === listingId);
  const agreement = agreementIndex === "" ? undefined : graph.agreements[Number(agreementIndex)];
  async function save(event: React.FormEvent) {
    event.preventDefault(); setError(null); setReceipt(null);
    if (!listing || !["creator", "takeover", "tapered"].includes(state)) { setError("Choose a listing and maintenance state."); return; }
    const date = new Date(effective);
    if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) { setError("Choose a future maintenance date."); return; }
    if (state !== "takeover" && (!agreement || date.getTime() < Date.parse(agreement.effectiveFrom) || (agreement.effectiveUntil && date.getTime() >= Date.parse(agreement.effectiveUntil)))) { setError("Choose a recorded agreement covering this maintenance date."); return; }
    setBusy(true);
    const controller = new AbortController(); pending.current = controller;
    try {
      const result = await fetch("/api/workspace/creator-maintenance", { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId: graph.workspaceId, listingId: listing.id, sourceRevisionId: listing.sourceRevisionId, state, effectiveFrom: date.toISOString(), ...(state !== "takeover" ? { agreementVersion: agreement!.version, rateReference: agreement!.rateReference } : {}) }) });
      const value = await result.json();
      if (!active.current || controller.signal.aborted) return;
      if (!result.ok) throw Error(typeof value.error === "string" ? value.error : "Maintenance could not be confirmed.");
      if (typeof value.id !== "string" || value.listing_id !== listing.id || value.maintainer_state !== state) throw Error("The maintenance receipt could not be confirmed. Reload its history.");
      setReceipt(`Maintenance terms recorded for ${value.effective_from}. No payment or provider change was made.`);
      router.refresh();
    } catch (caught) { if (active.current && !controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Maintenance could not be confirmed. Reload its history before retrying."); }
    finally { if (active.current) setBusy(false); if (pending.current === controller) pending.current = null; }
  }
  return <div className="mt-8 grid gap-6">
    <Card padding="lg"><h2 className="font-display text-xl">Recorded listings</h2>{graph.listings.length ? <ul className="mt-4 space-y-6">{graph.listings.map(item => <li key={item.id}><h3 className="font-medium">{item.definitionId}</h3><p className="mt-2 break-all text-sm text-gray-muted">Source revision: {item.sourceRevisionId}</p><p className="mt-2 text-sm">Initial maintenance: {item.maintainerState}. Agreement: {item.agreementVersion ?? "Not configured"}.</p>{item.history.length ? <ul className="mt-3 space-y-2 text-sm" aria-label={`Maintenance history for ${item.definitionId}`}>{item.history.map(entry => <li key={entry.id}>{entry.maintainer_state} · effective {entry.effective_from} · agreement {entry.agreement_version ?? "None"}</li>)}</ul> : <p className="mt-3 text-sm text-gray-muted">No later maintenance terms are recorded.</p>}</li>)}</ul> : <p className="mt-4">No creator royalty listing is recorded. Source qualification and a written agreement remain separate prerequisites.</p>}</Card>
    {graph.listings.length && graph.canMaintain ? <Card padding="lg"><h2 className="font-display text-xl">Record future maintenance terms</h2><p className="mt-4 text-sm text-gray-muted">Takeover ends this listing’s future creator eligibility. Creator and tapered states use an existing recorded agreement. This records royalty maintenance terms; it does not carry out a software handoff, create rates, or pay royalties.</p>{!graph.agreements.length ? <p className="mt-4" role="status">No creator agreement is configured. A creator or tapered royalty cannot be selected until its written agreement and rate are recorded.</p> : null}<form onSubmit={save} className="mt-6 grid gap-4">
      <SelectInput label="Listing" required disabled={busy} className="min-h-12" value={listingId} onChange={event => setListingId(event.target.value)} options={[{ value: "", label: "Choose a listing" }, ...graph.listings.map(item => ({ value: item.id, label: item.definitionId }))]} />
      <SelectInput label="Maintenance state" required disabled={busy} className="min-h-12" value={state} onChange={event => setState(event.target.value)} options={[{ value: "", label: "Choose a state" }, { value: "takeover", label: "Takeover — end future creator eligibility" }, ...(graph.agreements.length ? [{ value: "creator", label: "Creator — recorded agreement" }, { value: "tapered", label: "Tapered — recorded agreement" }] : [])]} />
      {state && state !== "takeover" ? <SelectInput label="Recorded agreement" required disabled={busy} className="min-h-12" value={agreementIndex} onChange={event => setAgreementIndex(event.target.value)} options={[{ value: "", label: "Choose an agreement" }, ...graph.agreements.map((item, index) => ({ value: String(index), label: `${item.version} · ${item.rateBps / 100}% · ${item.rateReference}` }))]} /> : null}
      <TextInput label="Effective date and time" type="datetime-local" required disabled={busy} className="min-h-12" value={effective} onChange={event => setEffective(event.target.value)} helperText="Your local time. Strelva records the exact UTC instant and checks the agreement again." />
      <Button type="submit" size="lg" disabled={busy}>{busy ? "Recording…" : "Record maintenance terms"}</Button>
    </form>{error ? <p role="alert" className="mt-4">{error}</p> : null}{receipt ? <p role="status" className="mt-4">{receipt}</p> : null}</Card> : graph.listings.length ? <p role="status">Future maintenance changes are unavailable after workspace exit. Recorded history remains available.</p> : null}
  </div>;
}
