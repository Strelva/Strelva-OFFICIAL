"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { SelectInput, TextInput } from "@/components/ui/TextInput";
import type { PayerSuccessorKind } from "@/platform/work-economics/payer-transitions";
import { responseAuthority, successorLabel } from "./payer-transition-ui";
import { usePayerTransitions } from "./usePayerTransitions";

export function WorkspacePayerTransition(props: { workspaceId: string; canPropose: boolean }) {
  // Navigation discards the previous workspace's form, requests and authority immediately.
  return <WorkspacePayerTransitionPanel key={props.workspaceId} {...props} />;
}

function WorkspacePayerTransitionPanel({ workspaceId, canPropose }: { workspaceId: string; canPropose: boolean }) {
  const { data, busy, loading, disabled, error, notice, refresh, command } = usePayerTransitions(workspaceId);
  const [kind, setKind] = useState<PayerSuccessorKind>("user");
  const pending = data?.pending;
  return <section className="mt-7 space-y-4" aria-labelledby="payer-transition-heading" aria-busy={busy || loading}>
    <div><h3 id="payer-transition-heading" className="text-sm font-medium text-warm-black">Payer for future jobs</h3>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-muted">An accepted change applies only to jobs created afterward. Existing budgets, reservations, recorded costs, and unresolved holds keep their original payer and limit.</p>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-muted">It grants no business, provider, or saved-work access. Each job limit and allowance cap still requires separate acceptance. This does not activate billing or authorize a charge.</p></div>
    {error ? <div className="space-y-3"><p role="alert" className="text-sm text-critical">{error}</p><Button variant="secondary" disabled={busy || loading} onClick={() => void refresh()}>Refresh payer history</Button></div> : null}
    {notice ? <p role="status" className="text-sm text-positive">{notice}</p> : null}
    {loading ? <p role="status" className="text-sm text-gray-muted">Loading payer history…</p> : null}
    {data?.current ? <p className="break-words text-sm"><strong>Current accepted successor:</strong> {successorLabel(data.current)} <span className="text-gray-muted">since {new Date(data.current.acceptedAt!).toLocaleString()}</span></p> : data ? <p className="text-sm text-gray-muted">No current accepted payer change is visible here.</p> : null}
    {pending ? <div className="rounded-xl border border-gray-border bg-surface-inset p-4 text-sm"><p className="break-words"><strong>Pending:</strong> {successorLabel(pending)}</p><p className="mt-1 break-words text-gray-muted">Proposed by {pending.proposerEmail}. {responseAuthority(pending)}</p>
      <div className="mt-3 flex flex-wrap gap-2">{pending.canRespond ? <><Button disabled={disabled} onClick={() => void command({ action: "accept", transitionId: pending.id })}>Accept future payer role</Button><Button variant="secondary" disabled={disabled} onClick={() => void command({ action: "reject", transitionId: pending.id })}>Decline</Button></> : null}{canPropose && pending.canRevoke ? <Button variant="secondary" disabled={disabled} onClick={() => void command({ action: "revoke", transitionId: pending.id })}>Revoke proposal</Button> : null}</div>
    </div> : canPropose && data ? <form className="max-w-md space-y-3" onSubmit={event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const successor = kind === "agency" ? { successorAgencyWorkspaceId: form.get("successorAgencyWorkspaceId") }
        : kind === "business" ? { successorKind: "business" } : { successorEmail: form.get("successorEmail") };
      void command({ action: "propose", workspaceId, ...successor });
    }}>
      <SelectInput label="Who will pay for future jobs?" value={kind} disabled={disabled} onChange={event => setKind(event.target.value as PayerSuccessorKind)} options={[{ value: "user", label: "A named person" }, { value: "agency", label: "An agency" }, { value: "business", label: "This business" }]} />
      {kind === "user" ? <TextInput label="Verified payer email" name="successorEmail" type="email" maxLength={254} required disabled={disabled} /> : null}
      {kind === "agency" ? <TextInput label="Agency workspace ID" name="successorAgencyWorkspaceId" required disabled={disabled} pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" helperText="Ask the agency for its workspace ID. A current agency owner or admin must accept on its behalf." /> : null}
      {kind === "business" ? <p className="text-sm text-gray-muted">A current business owner must accept this proposal before new jobs return to the business as payer.</p> : null}
      <Button type="submit" disabled={disabled}>Propose new payer</Button>
    </form> : null}
    {data?.transitions.length ? <details><summary className="min-h-11 cursor-pointer text-sm">Payer change history</summary><ul className="mt-3 space-y-2 text-sm">{data.transitions.map(item => <li key={item.id} className="break-words border-b border-gray-border pb-2"><span className="capitalize">{item.status}</span> · {successorLabel(item)}<span className="block text-xs text-gray-muted">Proposed {new Date(item.proposedAt).toLocaleString()}</span></li>)}</ul></details> : null}
  </section>;
}
