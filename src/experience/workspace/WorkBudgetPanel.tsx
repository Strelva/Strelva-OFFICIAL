"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import type { JobEconomicsRecord, JobEconomicsUsage } from "@/platform/work-economics/types";

type BudgetResponse = { ledger: JobEconomicsRecord | null; usage: JobEconomicsUsage[]; currentActorId: string; canManage: boolean; canAccept: boolean };
type Props = { workspaceId: string; workId: string; productId: "tracker" | "ai_visibility"; resourceKind: string; readOnly?: boolean };
const dollars = (cents: number | null) => cents === null ? "Not recorded" : new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(cents / 100);
function cents(value: FormDataEntryValue | null): number | null {
  if (value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 10000) throw new Error("Use an amount between $0 and $10,000.");
  return Math.round(number * 100);
}

export function WorkBudgetPanel(props: Props) {
  const [open, setOpen] = useState(false);
  return <details className="mx-auto w-full max-w-3xl border-t border-gray-border p-4" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer text-sm">Budget and cost</summary>
    {open ? <BudgetEditor key={props.workId} {...props} /> : null}
  </details>;
}

function BudgetEditor({ workspaceId, workId, productId, resourceKind, readOnly }: Props) {
  const [data, setData] = useState<BudgetResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/work-economics?workspaceId=${encodeURIComponent(workspaceId)}&workId=${encodeURIComponent(workId)}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "The budget could not be loaded."); if (!controller.signal.aborted) setData(body); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "The budget could not be loaded."); });
    return () => controller.abort();
  }, [workspaceId, workId]);
  async function command(body: Record<string, unknown>) {
    if (readOnly || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/work-economics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) {
        if (response.status < 500) { setRetry(null); setError(result.error ?? "Check the budget change."); return; }
        throw new Error(result.error ?? "The budget change could not be confirmed.");
      }
      setData(result); setRetry(null); setNotice("Budget record updated.");
    } catch (cause) { setRetry(body); setError(cause instanceof Error ? cause.message : "The budget change could not be confirmed."); }
    finally { setBusy(false); }
  }
  const job = data?.ledger;
  const canManage = data?.canManage && !readOnly && !busy && !retry;
  return <div className="mt-4 space-y-4 text-sm" aria-busy={busy}>
    <p className="text-gray-muted">This is an internal work budget. It does not charge a card or limit external tools yet. Reported costs are separate from provider-verified costs.</p>
    {error ? <p role="alert" className="text-critical">{error}</p> : null}
    {retry && !readOnly ? <div className="space-y-2"><p>The previous change could not be confirmed. Retry the same request before making another change.</p><Button disabled={busy} onClick={() => void command(retry)}>Retry budget change</Button></div> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {!data && !error ? <p role="status">Loading the budget…</p> : null}
    {data && !job ? canManage ? <form className="space-y-3" onSubmit={event => {
      event.preventDefault(); const form = new FormData(event.currentTarget);
      try { void command({ action: "create", workspaceId, workId, productId, resourceKind, payerId: data.currentActorId, estimateCents: cents(form.get("estimate")), maxAuthorizedCents: cents(form.get("maximum")) }); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "Check the amounts."); }
    }}>
      <p>You will be the payer for this budget. Accepting it is a separate step.</p>
      <TextInput label="Estimated cost, USD (optional)" name="estimate" type="number" min={0} max={10000} step="0.01" />
      <TextInput label="Maximum budget, USD" name="maximum" type="number" min={0} max={10000} step="0.01" required />
      <Button type="submit">Propose budget</Button>
    </form> : <p>No budget has been recorded for this work.</p> : null}
    {job ? <>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div><dt className="text-gray-muted">Status</dt><dd className="capitalize">{job.status}</dd></div>
        <div><dt className="text-gray-muted">Estimate</dt><dd>{dollars(job.estimateCents)}</dd></div>
        <div><dt className="text-gray-muted">Maximum</dt><dd>{dollars(job.maxAuthorizedCents)}</dd></div>
        <div><dt className="text-gray-muted">Reserved</dt><dd>{dollars(job.reservedCents)}</dd></div>
        <div><dt className="text-gray-muted">Recorded customer usage</dt><dd>{dollars(job.usedCents)}</dd></div>
        <div><dt className="text-gray-muted">Strelva retries, excluded</dt><dd>{dollars(job.strelvaRetryCents)}</dd></div>
        <div><dt className="text-gray-muted">Reported cost</dt><dd>{job.actualKnown ? dollars(job.actualCents) : "Not fully recorded"}</dd></div>
      </dl>
      {job.status === "draft" && data?.canAccept && !readOnly ? <Button disabled={busy || Boolean(retry)} onClick={() => void command({ action: "accept", jobId: job.id })}>Accept this budget</Button> : null}
      {canManage && (job.status === "accepted" || job.status === "reserved") ? <form className="space-y-3" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); try { void command({ action: "reserve", jobId: job.id, amountCents: cents(form.get("reserve")), idempotencyKey: crypto.randomUUID() }); } catch (cause) { setError(cause instanceof Error ? cause.message : "Check the amount."); } }}>
        <TextInput label="Reserve for this work, USD" name="reserve" type="number" min={0} max={(job.maxAuthorizedCents - job.reservedCents) / 100} step="0.01" required />
        <Button type="submit" variant="secondary">Reserve amount</Button>
      </form> : null}
      {canManage && (job.status === "accepted" || job.status === "reserved") ? <details><summary className="cursor-pointer">Record a cost</summary><form className="mt-3 space-y-3" onSubmit={event => {
        event.preventDefault(); const form = new FormData(event.currentTarget);
        try { void command({ action: "report_usage", jobId: job.id, idempotencyKey: crypto.randomUUID(), kind: form.get("kind"), attribution: form.get("retry") ? "strelva_retry" : "normal", amountCents: cents(form.get("cost")) }); }
        catch (cause) { setError(cause instanceof Error ? cause.message : "Check the amount."); }
      }}>
        <p>This is your cost report. Strelva has not verified it against a provider bill.</p>
        <label className="block">Cost type<select name="kind" className="mt-1 block w-full rounded border border-gray-border bg-white p-2"><option value="human">Staff time</option><option value="model">AI model</option><option value="provider">Service provider</option><option value="tool">Other tool</option></select></label>
        <TextInput label="Reported amount, USD" name="cost" type="number" min={0} max={10000} step="0.01" required />
        <label className="flex items-center gap-2"><input type="checkbox" name="retry" />Strelva caused this retry</label>
        <Button type="submit" variant="secondary">Record cost</Button>
      </form></details> : null}
      {canManage && (job.status === "accepted" || job.status === "reserved") && Boolean(data?.usage.length) && data?.usage.every(item => item.known) ? <Button variant="secondary" onClick={() => void command({ action: "settle", jobId: job.id, actualCents: job.usedCents })}>Close budget at {dollars(job.usedCents)}</Button> : null}
      {canManage && job.status !== "cancelled" && job.status !== "settled" ? <Button variant="secondary" disabled={busy} onClick={() => void command({ action: "cancel", jobId: job.id })}>Cancel unused budget</Button> : null}
      {data?.usage.length ? <section><h3 className="font-medium">Recorded usage</h3><ul className="mt-2 space-y-2">{data.usage.map(item => <li key={item.id}>{item.kind}: {dollars(item.amountCents)}{item.attribution === "strelva_retry" ? " · Strelva retry, excluded from your usage" : ""}</li>)}</ul></section> : null}
    </> : null}
  </div>;
}
