"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SelectInput } from "@/components/ui/TextInput";
import type { ResponsibilityProofCard } from "@/platform/work-execution/responsibility-proof";

export interface ResponsibilityProofData {
  proof: { cards: ResponsibilityProofCard[]; verdict: string };
  state: { businessId: string; providerWorkspaceId: string | null; canSetCadence: boolean; cadence: "weekly" | "monthly";
    mandates: Array<{ serviceRequestId: string; providerWorkspaceId: string; investigations: Record<string,string>; everySeconds: number; nextAt: string; idempotencyKey: string }> };
}
export function ResponsibilityProof(props: { workspaceId: string; readOnly: boolean; initial?: ResponsibilityProofData }) {
  return <ScopedResponsibilityProof key={props.workspaceId} {...props} initial={props.initial?.state.businessId === props.workspaceId ? props.initial : undefined} />;
}
function ScopedResponsibilityProof({ workspaceId, readOnly, initial }: { workspaceId: string; readOnly: boolean; initial?: ResponsibilityProofData }) {
  const [data, setData] = useState<ResponsibilityProofData | null>(initial ?? null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const active = useRef(true), readSequence = useRef(0);
  const controllers = useRef(new Set<AbortController>());
  function controller() { const value = new AbortController(); controllers.current.add(value); return value; }
  useEffect(() => {
    active.current = true;
    const pending = controllers.current;
    return () => { active.current = false; for (const request of pending) request.abort(); pending.clear(); };
  }, []);
  async function load() {
    const sequence = ++readSequence.current, request = controller();
    setError(""); setBusy(true);
    const to = new Date(); const from = new Date(to.getTime() - 7 * 86_400_000);
    try {
      const response = await fetch(`/api/operations?view=responsibility_proof&workspaceId=${workspaceId}&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`, { signal: request.signal });
      const result = await response.json().catch(() => { throw new Error("Responsibility proof is unavailable."); });
      if (!response.ok) throw new Error(result.error ?? "Responsibility proof is unavailable.");
      if (active.current && sequence === readSequence.current) setData(result);
    } catch (cause) { if (active.current && sequence === readSequence.current && !request.signal.aborted) setError(cause instanceof Error ? cause.message : "Responsibility proof is unavailable."); }
    finally { controllers.current.delete(request); if (active.current && sequence === readSequence.current) setBusy(false); }
  }
  useEffect(() => {
    if (initial) return;
    const sequence = ++readSequence.current, request = controller(), pending = controllers.current;
    const to = new Date(), from = new Date(to.getTime() - 7 * 86_400_000);
    fetch(`/api/operations?view=responsibility_proof&workspaceId=${workspaceId}&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`, { signal: request.signal })
      .then(async response => { const result = await response.json().catch(() => { throw new Error("Responsibility proof is unavailable."); }); if (!response.ok) throw new Error(result.error ?? "Responsibility proof is unavailable."); return result; })
      .then(result => { if (active.current && sequence === readSequence.current) setData(result); }).catch(cause => { if (active.current && sequence === readSequence.current && !request.signal.aborted) setError(cause instanceof Error ? cause.message : "Responsibility proof is unavailable."); });
    return () => { request.abort(); pending.delete(request); };
  }, [workspaceId, initial]);
  async function change(command: Record<string,unknown>) {
    if (initial || readOnly || busy || error) return;
    const request = controller();
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command), signal: request.signal });
      const result = await response.json().catch(() => { throw new Error("The change could not be confirmed. Reload before trying again."); });
      if (!response.ok) throw new Error(result.error ?? "This change could not be confirmed. Reload before trying again.");
      if (!active.current || request.signal.aborted) return;
      setNotice(command.action === "keep_me_found" ? "Keep me found is running within the exact accepted scope." : "Report cadence saved.");
      await load();
    } catch (cause) { if (active.current && !request.signal.aborted) setError(cause instanceof Error ? cause.message : "The change could not be confirmed. Reload before trying again."); }
    finally { controllers.current.delete(request); if (active.current) setBusy(false); }
  }
  return <section aria-label="Responsibility proof" className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-4"><h2 className="font-display text-2xl text-warm-black">This week’s responsibilities</h2><Button variant="ghost" loading={busy} disabled={Boolean(initial)} onClick={() => void load()}>Reload proof</Button></div>
    {error ? <Card><p role="alert" className="text-sm text-critical">{error}</p><p className="mt-2 text-sm text-gray-muted">Reload to confirm the current state before another change.</p></Card> : null}
    {!data && !error ? <p role="status" className="text-sm text-gray-muted">Loading responsibility receipts…</p> : null}
    {notice ? <p role="status" className="text-sm text-accent-text">{notice}</p> : null}
    {data ? <>
      <p className="text-sm leading-relaxed text-gray-muted">{data.proof.verdict}</p>
      {data.state.canSetCadence ? <div className="max-w-xs"><SelectInput label="Owner report cadence" value={data.state.cadence} options={[{ value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" }]} disabled={readOnly || busy || Boolean(error) || Boolean(initial)} onChange={event => void change({ action: "responsibility_cadence", workspaceId, cadence: event.target.value })}/></div> : <p className="text-sm text-gray-muted">The responsible agency sets report cadence.</p>}
      {data.state.mandates.map(mandate => <Card key={mandate.serviceRequestId}><h3 className="text-base font-medium text-warm-black">Keep me found</h3><p className="mt-2 text-sm leading-relaxed text-gray-muted">Your agency accepted Google reply checks, business hours checks, website health, inquiry reply time and weekly proof. Outside changes still ask for the required approval.</p><Button className="mt-4" disabled={readOnly || busy || Boolean(error) || Boolean(initial)} onClick={() => void change({ action: "keep_me_found", input: { businessId: workspaceId, ...mandate } })}>Turn on Keep me found</Button></Card>)}
      {!data.proof.cards.length ? <p className="text-sm text-gray-muted">No standing responsibilities yet. An accepted agency mandate with agreed sources and cadence makes Keep me found available.</p> : <ul className="grid gap-4 sm:grid-cols-2">{data.proof.cards.map(card => <li key={card.responsibilityId}><Card className="h-full"><div className="flex flex-wrap justify-between gap-2"><h3 className="text-base font-medium text-warm-black">{card.title}</h3><span className="text-sm text-gray-muted">{card.status === "verified" ? "Verified actions" : card.status === "partial" ? "Partial evidence" : card.status === "failed" ? "Needs attention" : "Unverified"}</span></div><dl className="mt-4 space-y-3 text-sm leading-relaxed"><div><dt className="font-medium text-warm-black">Did</dt><dd className="text-gray-muted">{card.did}</dd></div><div><dt className="font-medium text-warm-black">Verified</dt><dd className="text-gray-muted">{card.verified}</dd></div></dl><div className="mt-4 flex flex-wrap gap-4 text-sm"><a className="inline-flex min-h-11 items-center text-accent-text underline focus-visible:outline-2 focus-visible:outline-offset-2" href={card.openHref}>Open receipts</a>{card.undoHref ? <a className="inline-flex min-h-11 items-center text-accent-text underline focus-visible:outline-2 focus-visible:outline-offset-2" href={card.undoHref}>Review undo</a> : <span className="text-gray-muted">No reversible write recorded</span>}</div></Card></li>)}</ul>}
    </> : null}
  </section>;
}
