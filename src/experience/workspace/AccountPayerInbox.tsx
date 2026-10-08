"use client";

import { Button } from "@/components/ui/Button";
import { responseAuthority, successorLabel } from "./payer-transition-ui";
import { usePayerTransitions } from "./usePayerTransitions";

const money = (cents: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(cents / 100);

export function AccountPayerInbox() {
  const { data, busy, loading, disabled, error, notice, refresh, command } = usePayerTransitions(null);

  const pending = data?.transitions.filter(item => item.status === "pending") ?? [];
  const accepted = data?.transitions.filter(item => item.status === "accepted") ?? [];
  const jobs = data?.jobs ?? [];
  return <div className="mt-5 space-y-5" aria-busy={busy || loading}>
    {loading ? <p className="text-sm text-gray-muted" role="status">Checking payer requests…</p> : null}
    {notice ? <p role="status" className="text-sm text-positive">{notice}</p> : null}
    {error ? <div className="space-y-3"><p role="alert" className="text-sm text-critical">{error}</p><Button variant="secondary" disabled={busy || loading} onClick={() => void refresh()}>Refresh payer history</Button></div> : null}
    {data && !error && !pending.length && !accepted.length && !jobs.length ? <p className="text-sm text-gray-muted">No payer requests or job limits are available to you or a party you currently represent.</p> : null}
    {pending.map(item => <article key={item.id} className="rounded-xl border border-gray-border p-4">
      <h3 className="break-words text-sm font-medium text-warm-black">Future jobs for {item.workspaceName}</h3>
      <p className="mt-2 break-words text-sm"><strong>Proposed payer:</strong> {successorLabel(item)}</p>
      <p className="mt-2 break-words text-sm leading-relaxed text-gray-muted">{item.proposerEmail} proposed this payer for jobs created after acceptance. {responseAuthority(item)} This does not grant business, provider, or saved-work access. Each job limit and allowance cap still requires separate acceptance; it does not activate billing or authorize a charge.</p>
      <p className="mt-2 text-sm leading-relaxed text-gray-muted">Existing jobs, reservations, recorded costs, and unresolved holds keep their original payer and limit.</p>
      {item.canRespond ? <div className="mt-4 flex flex-wrap gap-2"><Button disabled={disabled} onClick={() => void command({ action: "accept", transitionId: item.id })}>Accept future payer role</Button><Button variant="secondary" disabled={disabled} onClick={() => void command({ action: "reject", transitionId: item.id })}>Decline</Button></div> : <p className="mt-3 text-sm text-gray-muted">You cannot respond to this proposal with your current role.</p>}
    </article>)}
    {accepted.map(item => <article key={item.id} className="rounded-xl border border-gray-border p-4">
      <h3 className="break-words text-sm font-medium text-warm-black">{item.isCurrent ? "Current accepted payer" : "Previously accepted payer"} for {item.workspaceName}</h3>
      <p className="mt-2 text-sm leading-relaxed text-gray-muted">Accepted payer: {successorLabel(item)}. {item.isCurrent ? "New jobs can use this payer; each job limit remains separate." : "Jobs created while this payer was current retain their original payer and limits."}</p>
    </article>)}
    {jobs.map(job => <article key={job.id} className="rounded-xl border border-gray-border p-4">
      <h3 className="break-words text-sm font-medium text-warm-black">{job.workspaceName} · {job.productId.replaceAll("_", " ")}</h3>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-gray-muted">Maximum</dt><dd>{money(job.maxAuthorizedCents)}</dd></div><div><dt className="text-gray-muted">Status</dt><dd className="capitalize">{job.status}</dd></div><div><dt className="text-gray-muted">Estimate</dt><dd>{job.estimateCents === null ? "Unknown" : money(job.estimateCents)}</dd></div><div><dt className="text-gray-muted">Reserved or held</dt><dd>{money(job.reservedCents)}</dd></div><div><dt className="text-gray-muted">Recorded use</dt><dd>{money(job.usedCents)}</dd></div><div><dt className="text-gray-muted">Final actual</dt><dd>{job.actualKnown && job.actualCents !== null ? money(job.actualCents) : "Unresolved"}</dd></div></dl>
      <p className="mt-3 text-xs leading-relaxed text-gray-muted">This financial receipt does not include the saved work’s title, content, or customer data.</p>
      {job.status === "draft" ? <Button className="mt-4" disabled={disabled} onClick={() => void command({ action: "accept_job", jobId: job.id })}>Accept {money(job.maxAuthorizedCents)} job limit</Button> : null}
    </article>)}
  </div>;
}
