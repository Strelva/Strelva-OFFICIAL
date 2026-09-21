"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { PayerTransitionSnapshot } from "@/platform/work-economics/payer-transitions";

const money = (cents: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(cents / 100);

export function AccountPayerInbox() {
  const [data, setData] = useState<PayerTransitionSnapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/work-economics/payer-transition", { cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error ?? "Payer requests could not be loaded.");
    setData(body);
  }, []);
  useEffect(() => { void load().catch(cause => setError(cause instanceof Error ? cause.message : "Payer requests could not be loaded.")); }, [load]);

  async function transition(action: "accept" | "reject", transitionId: string) {
    setBusy(transitionId); setError("");
    try {
      const response = await fetch("/api/work-economics/payer-transition", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, transitionId }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "The payer request could not be confirmed.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The payer request could not be confirmed."); }
    finally { setBusy(""); }
  }

  async function acceptJob(jobId: string) {
    setBusy(jobId); setError("");
    try {
      const response = await fetch("/api/work-economics/payer-transition", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "accept_job", jobId }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "The job limit could not be accepted.");
      setData(body);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The job limit could not be accepted."); }
    finally { setBusy(""); }
  }

  const pending = data?.transitions.filter(item => item.status === "pending") ?? [];
  const accepted = data?.transitions.filter(item => item.status === "accepted") ?? [];
  const jobs = data?.jobs ?? [];
  if (!data && !error) return <p className="mt-4 text-sm text-gray-muted" role="status">Checking payer requests…</p>;
  return <div className="mt-5 space-y-5">
    {error ? <p role="alert" className="text-sm text-critical">{error}</p> : null}
    {!pending.length && !accepted.length && !jobs.length ? <p className="text-sm text-gray-muted">No payer requests or job limits are addressed to this account.</p> : null}
    {pending.map(item => <article key={item.id} className="rounded-xl border border-gray-border p-4">
      <h3 className="text-sm font-medium text-warm-black">Future jobs for {item.workspaceName}</h3>
      <p className="mt-2 text-sm leading-relaxed text-gray-muted">{item.proposerEmail} asked this exact account to become payer for jobs created after acceptance. This does not grant access to the business or its saved work. Each job limit still requires separate acceptance.</p>
      <div className="mt-4 flex flex-wrap gap-2"><Button disabled={busy === item.id} onClick={() => void transition("accept", item.id)}>Accept future payer role</Button><Button variant="secondary" disabled={busy === item.id} onClick={() => void transition("reject", item.id)}>Decline</Button></div>
    </article>)}
    {accepted.map(item => <article key={item.id} className="rounded-xl border border-gray-border p-4">
      <h3 className="text-sm font-medium text-warm-black">Accepted future payer role for {item.workspaceName}</h3>
      <p className="mt-2 text-sm leading-relaxed text-gray-muted">Accepted by this verified account. Only jobs created after this acceptance can name this account, and each job limit remains separate.</p>
    </article>)}
    {jobs.map(job => <article key={job.id} className="rounded-xl border border-gray-border p-4">
      <h3 className="text-sm font-medium text-warm-black">{job.workspaceName} · {job.productId.replaceAll("_", " ")}</h3>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-gray-muted">Maximum</dt><dd>{money(job.maxAuthorizedCents)}</dd></div><div><dt className="text-gray-muted">Status</dt><dd className="capitalize">{job.status}</dd></div><div><dt className="text-gray-muted">Estimate</dt><dd>{job.estimateCents === null ? "Unknown" : money(job.estimateCents)}</dd></div><div><dt className="text-gray-muted">Reserved or held</dt><dd>{money(job.reservedCents)}</dd></div><div><dt className="text-gray-muted">Recorded use</dt><dd>{money(job.usedCents)}</dd></div><div><dt className="text-gray-muted">Final actual</dt><dd>{job.actualKnown && job.actualCents !== null ? money(job.actualCents) : "Unresolved"}</dd></div></dl>
      <p className="mt-3 text-xs leading-relaxed text-gray-muted">This financial receipt does not include the saved work’s title, content, or customer data.</p>
      {job.status === "draft" ? <Button className="mt-4" disabled={busy === job.id} onClick={() => void acceptJob(job.id)}>Accept {money(job.maxAuthorizedCents)} job limit</Button> : null}
    </article>)}
  </div>;
}
