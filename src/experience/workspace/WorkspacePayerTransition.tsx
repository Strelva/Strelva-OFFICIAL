"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import type { PayerTransitionSnapshot } from "@/platform/work-economics/payer-transitions";

export function WorkspacePayerTransition({ workspaceId, canPropose }: { workspaceId: string; canPropose: boolean }) {
  const [data, setData] = useState<PayerTransitionSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/work-economics/payer-transition?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store", signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Payer history could not be loaded.");
      setData(body);
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "Payer history could not be loaded.");
    }
  }, [workspaceId]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  async function command(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/work-economics/payer-transition", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The payer change could not be confirmed.");
      setData(result);
      const resolved = typeof body.transitionId === "string" ? result.transitions?.find((item: { id: string }) => item.id === body.transitionId) : null;
      setNotice(body.action === "accept" && resolved?.status === "stale" ? "This proposal became stale because its proposer is no longer a business owner." : body.action === "accept" ? "You accepted responsibility for future jobs." : body.action === "reject" ? "You declined this payer change." : body.action === "revoke" ? "The pending payer change was revoked." : "Payer change proposed. The addressed person must accept it.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The payer change could not be confirmed."); }
    finally { setBusy(false); }
  }

  const pending = data?.pending;
  const addressed = Boolean(pending && pending.successorUserId === data?.currentActorId);
  return <section className="mt-7 space-y-4" aria-labelledby="payer-transition-heading" aria-busy={busy}>
    <div><h3 id="payer-transition-heading" className="text-sm font-medium text-warm-black">Payer for future jobs</h3>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-muted">An accepted change applies only to jobs created afterward. Existing budgets, reservations, recorded costs, and unresolved holds keep their original payer and limit.</p></div>
    {error ? <p role="alert" className="text-sm text-critical">{error}</p> : null}
    {notice ? <p role="status" className="text-sm text-positive">{notice}</p> : null}
    {!data && !error ? <p role="status" className="text-sm text-gray-muted">Loading payer history…</p> : null}
    {data?.current ? <p className="text-sm"><strong>Current accepted successor:</strong> {data.current.successorEmail} <span className="text-gray-muted">since {new Date(data.current.acceptedAt!).toLocaleString()}</span></p> : <p className="text-sm text-gray-muted">No successor payer has been accepted for future jobs.</p>}
    {pending ? <div className="rounded-xl border border-gray-border bg-surface-inset p-4 text-sm"><p><strong>Pending:</strong> {pending.successorEmail}</p><p className="mt-1 text-gray-muted">Proposed by {pending.proposerEmail}. Only this addressed verified person can accept.</p>
      <div className="mt-3 flex flex-wrap gap-2">{addressed ? <><Button disabled={busy} onClick={() => void command({ action: "accept", transitionId: pending.id })}>Accept future payer role</Button><Button variant="secondary" disabled={busy} onClick={() => void command({ action: "reject", transitionId: pending.id })}>Decline</Button></> : null}{canPropose ? <Button variant="secondary" disabled={busy} onClick={() => void command({ action: "revoke", transitionId: pending.id })}>Revoke proposal</Button> : null}</div>
    </div> : canPropose ? <form className="max-w-md space-y-3" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void command({ action: "propose", workspaceId, successorEmail: form.get("successorEmail") }); }}>
      <TextInput label="Verified payer email" name="successorEmail" type="email" maxLength={254} required />
      <Button type="submit" disabled={busy}>Propose new payer</Button>
    </form> : null}
    {data?.transitions.length ? <details><summary className="cursor-pointer text-sm">Payer change history</summary><ul className="mt-3 space-y-2 text-sm">{data.transitions.map(item => <li key={item.id} className="border-b border-gray-border pb-2"><span className="capitalize">{item.status}</span> · {item.successorEmail}<span className="block text-xs text-gray-muted">Proposed {new Date(item.proposedAt).toLocaleString()}</span></li>)}</ul></details> : null}
  </section>;
}
