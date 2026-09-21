"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { PersonalAiAccessControl } from "@/experience/operations/PersonalAiAccessControl";
import type { WorkParticipation } from "@/platform/work-participation/service";
import type { WorkContextView } from "@/platform/work-context/service";

type ParticipationView = WorkParticipation & { currentActorEmail: string; workRevision: string; canManage: boolean };
type Props = { initiallyOpen?: boolean; workId: string; canManage: boolean; sources: Array<{ id: string; title?: string }> };
const control = "mt-1 block w-full rounded-md border border-gray-border bg-transparent px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const date = (value: string) => new Date(value).toLocaleDateString();
async function request(path: string, init?: RequestInit) {
  const response = await fetch(path, { ...init, cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw Object.assign(new Error(body.error ?? "This work could not be opened."), { status: response.status });
  return body;
}

/** Per-work authority stays alongside the result, with machinery disclosed only when needed. */
export function WorkAuthorityPanel(props: Props) {
  const [open, setOpen] = useState(props.initiallyOpen ?? false);
  return <details open={open} className="mx-auto w-full max-w-3xl border-t border-gray-border p-4" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer text-sm font-medium">Sources and collaborators</summary>
    {open ? <AuthorityEditor key={props.workId} {...props} /> : null}
  </details>;
}
function AuthorityEditor({ workId, canManage: requestedManage, sources }: Props) {
  const [context, setContext] = useState<WorkContextView | null>(null);
  const [participation, setParticipation] = useState<ParticipationView | null>(null);
  const [contextError, setContextError] = useState("");
  const [contextDenied, setContextDenied] = useState(false);
  const [participationError, setParticipationError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [retryContribution, setRetryContribution] = useState<Record<string, unknown> | null>(null);
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const query = `?workId=${encodeURIComponent(workId)}`;
    request(`/api/work-context${query}`, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) { setContext(value); setContextError(""); setContextDenied(false); } }).catch(cause => { if (!controller.signal.aborted) { if (cause.status === 403) setContextDenied(true); else setContextError(cause.message); } });
    request(`/api/work-participation${query}`, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) { setParticipation(value); setParticipationError(""); } }).catch(cause => { if (!controller.signal.aborted) setParticipationError(cause.message); });
    return () => controller.abort();
  }, [workId, generation]);
  async function change(domain: "context" | "participation", command: Record<string, unknown>) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const body = await request(`/api/work-${domain}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workId, command }) });
      if (domain === "context") setContext(body); else setParticipation(previous => previous ? { ...previous, ...body } : body);
      if (command.kind === "contribute") setRetryContribution(null);
      setNotice(command.kind === "contribute" ? "Contribution sent for review." : command.kind === "review" ? "Review saved. The original work has not been changed." : "Work access updated.");
    } catch (cause) { if (command.kind === "contribute") setRetryContribution(command); setError(cause instanceof Error ? cause.message : "The change could not be confirmed."); setGeneration(value => value + 1); }
    finally { setBusy(false); }
  }
  const canManage = requestedManage && participation?.canManage === true;
  const ownGrant = participation?.grants.find(grant => grant.participantEmail === participation.currentActorEmail && grant.scope.includes("propose") && grant.status === "active" && Date.parse(grant.expiresAt) > Date.now());
  const sevenDays = () => new Date(Date.now() + 7 * 86400000).toISOString();
  const activeGrants = participation?.grants.filter(g => g.status === "active" && Date.parse(g.expiresAt) > Date.now()) ?? [];
  return <div className="mt-5 space-y-6 text-sm" aria-busy={busy}>
    {error ? <p role="alert" className="text-critical">{error}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {retryContribution ? <div className="space-y-2"><p>The contribution was not confirmed. Retry this same proposal to avoid a duplicate.</p><Button disabled={busy} variant="secondary" onClick={() => void change("participation", retryContribution)}>Retry contribution</Button><Button disabled={busy} variant="secondary" onClick={() => { setRetryContribution(null); setGeneration(value => value + 1); }}>Review current contributions</Button></div> : null}
    {!context && !contextError && !contextDenied || !participation && !participationError ? <p role="status">Loading work access…</p> : null}
    {!contextDenied ? <section aria-label="Sources for this work" className="space-y-3">
      <h3 className="font-medium">Additional source access</h3>
      {contextError ? <p className="text-gray-muted">{contextError}</p> : null}
      {context && !context.grants.length ? <p className="text-gray-muted">No additional sources have been approved here.</p> : null}
      {context?.grants.length ? <ul className="divide-y divide-gray-border">{context.grants.map(grant => <li key={grant.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
        <div className="min-w-0"><p className="break-words">{grant.title}</p><p className="text-xs text-gray-muted">{grant.status === "revoked" ? "Access removed" : Date.parse(grant.expiresAt) <= Date.now() ? "Access expired" : `Allowed until ${date(grant.expiresAt)}`} · Version {grant.sourceRevision}</p></div>
        {canManage && grant.status === "active" ? <Button variant="secondary" disabled={busy} onClick={() => void change("context", { kind: "revoke_source", expectedRevision: context.revision, grantId: grant.id })}>Remove access</Button> : null}
      </li>)}</ul> : null}
      {context?.facts.length ? <ul className="space-y-3">{context.facts.map(fact => <li key={fact.id} className="border-l-2 border-gray-border pl-3"><p>{fact.key}: {fact.value}</p><p className="text-xs text-gray-muted">{fact.status} · {fact.evidenceKind} · Captured {date(fact.capturedAt)}</p><p className="mt-1 text-xs text-gray-muted">Source evidence: {fact.excerpt}</p></li>)}</ul> : null}
      {canManage && context && sources.some(source => source.id !== workId) ? <details><summary className="cursor-pointer">Allow another source</summary><form className="mt-3 space-y-3" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void change("context", { kind: "grant_source", expectedRevision: context.revision, sourceWorkId: form.get("source"), scope: ["read", "use_in_work"], purpose: "Use this source to complete the selected work", expiresAt: sevenDays() }); }}>
        <label className="block">Saved source<select name="source" className={control} required>{sources.filter(source => source.id !== workId).map(source => <option key={source.id} value={source.id}>{source.title ?? "Untitled work"}</option>)}</select></label>
        <p className="text-xs text-gray-muted">Allow this exact source version for seven days. A changed version needs fresh approval.</p>
        <Button type="submit" variant="secondary" disabled={busy}>Allow source for this work</Button>
      </form></details> : null}
    </section> : null}
    <section aria-label="Work collaborators" className="space-y-3">
      <h3 className="font-medium">Who can contribute</h3>
      {participationError ? <p className="text-gray-muted">{participationError}</p> : null}
      {participation && !activeGrants.length ? <p className="text-gray-muted">No outside collaborators have current access.</p> : null}
      {canManage && activeGrants.length ? <p><a href={`/workspace/contribute/${encodeURIComponent(workId)}`} className="underline underline-offset-4">Open the contribution link</a><span className="block mt-1 text-xs text-gray-muted">Only the verified accounts you grant can use this link.</span></p> : null}
      {activeGrants.length ? <ul className="divide-y divide-gray-border">{activeGrants.map(grant => <li key={grant.id} className="flex flex-wrap items-start justify-between gap-3 py-3"><div className="min-w-0"><p className="break-all">{grant.participantEmail}</p><p className="text-xs text-gray-muted">{grant.participantKind === "agent" ? "Sponsored agent account" : "Collaborator"} · Until {date(grant.expiresAt)}</p><p className="mt-1 text-gray-muted">{grant.purpose}</p></div>{canManage ? <Button variant="secondary" disabled={busy} onClick={() => void change("participation", { kind: "revoke", expectedRevision: participation!.revision, grantId: grant.id })}>Revoke access</Button> : null}</li>)}</ul> : null}
      {canManage && participation ? <details><summary className="cursor-pointer">Invite a contribution</summary><form className="mt-3 space-y-3" onSubmit={event => {
        event.preventDefault(); const form = new FormData(event.currentTarget);
        void change("participation", { kind: "grant", expectedRevision: participation.revision, participantEmail: form.get("email"), participantKind: form.get("agent") ? "agent" : "person", scope: ["read", "propose"], purpose: form.get("purpose"), expiresAt: sevenDays(), budgetMinor: Math.round(Number(form.get("budget") || 0) * 100), currency: "USD" });
      }}>
        <TextInput label="Account email" name="email" type="email" required />
        <TextInput label="What should they contribute?" name="purpose" maxLength={1000} required />
        <TextInput label="Maximum reported contribution cost, USD" name="budget" type="number" min={0} max={1000000} step="0.01" defaultValue="0" required />
        <label className="flex items-center gap-2"><input name="agent" type="checkbox" />This is a sponsored agent account</label>
        <p className="text-xs text-gray-muted">They can read this work and submit a proposal for seven days. You review the result. This does not authorize a payment or run an outside agent. Share the contribution link with their verified account.</p>
        <Button type="submit" variant="secondary" disabled={busy}>Grant access to this work</Button>
      </form></details> : null}
    </section>
    <PersonalAiAccessControl
      key={workId}
      workId={workId}
      canManage={canManage}
      participationRevision={participation?.revision ?? null}
      hasContributions={Boolean(participation?.contributions.length)}
      onAuthorityChanged={() => setGeneration(value => value + 1)}
    />
    {participation && ownGrant ? <details open={!participation.contributions.some(contribution => contribution.actorEmail === participation.currentActorEmail)} aria-label="Submit a contribution" className="space-y-3"><summary className="cursor-pointer font-medium">{participation.contributions.some(contribution => contribution.actorEmail === participation.currentActorEmail) ? "Send another proposal" : "Contribute to this work"}</summary><form className="space-y-3" onSubmit={event => {
      event.preventDefault(); const form = new FormData(event.currentTarget);
      void change("participation", { kind: "contribute", expectedRevision: participation.revision, grantId: ownGrant.id, baseWorkRevision: participation.workRevision, summary: form.get("summary"), content: form.get("content"), costMinor: Math.round(Number(form.get("cost") || 0) * 100), idempotencyKey: crypto.randomUUID() });
    }}><TextInput label="What changed?" name="summary" maxLength={500} required /><label className="block">Your proposal<textarea name="content" className={control} rows={6} maxLength={20000} required /></label><TextInput label="Reported contribution cost, USD" name="cost" type="number" min={0} max={ownGrant.budgetMinor / 100} step="0.01" defaultValue="0" required /><p className="text-xs text-gray-muted">Your proposal is reviewed before the original work changes. The account that granted access is recorded as its sponsor.</p><Button type="submit" disabled={busy || Boolean(retryContribution)}>Submit for review</Button></form></details> : null}
    {participation?.contributions.length ? <section id="work-contributions" aria-label="Contributions" className="scroll-mt-4 space-y-4"><h3 className="font-medium">Contributions</h3>{participation.contributions.map(contribution => <article key={contribution.id} className="space-y-2 border-t border-gray-border pt-3"><p className="font-medium">{contribution.summary}</p><p className="text-xs text-gray-muted">{contribution.actorEmail} · {contribution.status} · Reported cost {contribution.costMinor === null ? "unknown" : `${(contribution.costMinor / 100).toFixed(2)} ${contribution.currency}`}</p><p className="whitespace-pre-wrap break-words">{contribution.content}</p>{contribution.reviewReason ? <p className="text-gray-muted">Review: {contribution.reviewReason}</p> : null}{canManage && contribution.status === "pending" ? <form className="space-y-2" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null; void change("participation", { kind: "review", expectedRevision: participation.revision, contributionId: contribution.id, decision: submitter?.value === "reject" ? "reject" : "accept", reason: form.get("reason") }); }}><TextInput label="Review reason" name="reason" maxLength={1000} required /><div className="flex flex-wrap gap-2"><Button type="submit" value="accept" disabled={busy}>Accept proposal</Button><Button type="submit" value="reject" variant="secondary" disabled={busy}>Request revision</Button></div><p className="text-xs text-gray-muted">Acceptance records your review. Applying the proposal still uses this work’s normal edit and approval controls.</p></form> : null}</article>)}</section> : null}
    {contextError || participationError ? <Button variant="secondary" disabled={busy} onClick={() => setGeneration(value => value + 1)}>Reload work access</Button> : null}
  </div>;
}
