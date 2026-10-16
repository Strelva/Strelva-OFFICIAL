"use client";
/**
 * Who may read and propose changes to one piece of work, and what they sent
 * (XA, lane xs-apps-care). Per-work authority stays beside the result; the
 * machinery opens only when asked. Commands, revisions and the
 * retry-the-same-contribution path are unchanged.
 */
import { useEffect, useState } from "react";
import { XaButton, XaField, XaInitial, XaStatus, XaTextArea, XaTextLink } from "@/components/ui/strelva/Xa";
import { XaBlock, XaNote } from "@/experience/xa-object/XaObjectPage";
import { PersonalAiAccessControl } from "@/experience/operations/PersonalAiAccessControl";
import type { WorkParticipation } from "@/platform/work-participation/service";
import type { WorkContextView } from "@/platform/work-context/service";
import styles from "./work-authority.module.css";

type ParticipationView = WorkParticipation & { currentActorEmail: string; workRevision: string; canManage: boolean };
type Props = { initiallyOpen?: boolean; workId: string; canManage: boolean; sources: Array<{ id: string; title?: string }>; transport?: typeof fetch };
const date = (value: string) => new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const CONTRIBUTION_WORD = { pending: "Waits for review", accepted: "Accepted", rejected: "Revision asked for" } as const;
async function call(transport: typeof fetch | undefined, path: string, init?: RequestInit) {
  const response = await (transport ?? fetch)(path, { ...init, cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw Object.assign(new Error(body.error ?? "This work could not be opened."), { status: response.status });
  return body;
}

export function WorkAuthorityPanel(props: Props) {
  const [open, setOpen] = useState(props.initiallyOpen ?? false);
  return <details open={open} className={styles.panel} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className={styles.summary}>Sources and collaborators</summary>
    {open ? <AuthorityEditor key={props.workId} {...props} /> : null}
  </details>;
}

function AuthorityEditor({ workId, canManage: requestedManage, sources, transport }: Props) {
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
  const [inviting, setInviting] = useState(false);
  const [allowing, setAllowing] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const query = `?workId=${encodeURIComponent(workId)}`;
    call(transport, `/api/work-context${query}`, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) { setContext(value); setContextError(""); setContextDenied(false); } }).catch(cause => { if (!controller.signal.aborted) { if (cause.status === 403) setContextDenied(true); else setContextError(cause.message); } });
    call(transport, `/api/work-participation${query}`, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) { setParticipation(value); setParticipationError(""); } }).catch(cause => { if (!controller.signal.aborted) setParticipationError(cause.message); });
    return () => controller.abort();
  }, [workId, generation, transport]);
  async function change(domain: "context" | "participation", command: Record<string, unknown>) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const body = await call(transport, `/api/work-${domain}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workId, command }) });
      if (domain === "context") setContext(body); else setParticipation(previous => previous ? { ...previous, ...body } : body);
      if (command.kind === "contribute") setRetryContribution(null);
      setInviting(false); setAllowing(false);
      setNotice(command.kind === "contribute" ? "Sent for review. The work changes only when it's accepted." : command.kind === "review" ? "Review saved. The original work hasn't changed." : "Access updated.");
    } catch (cause) { if (command.kind === "contribute") setRetryContribution(command); setError(cause instanceof Error ? cause.message : "The change could not be confirmed."); setGeneration(value => value + 1); }
    finally { setBusy(false); }
  }
  const canManage = requestedManage && participation?.canManage === true;
  const ownGrant = participation?.grants.find(grant => grant.participantEmail === participation.currentActorEmail && grant.scope.includes("propose") && grant.status === "active" && Date.parse(grant.expiresAt) > Date.now());
  const sevenDays = () => new Date(Date.now() + 7 * 86400000).toISOString();
  const activeGrants = participation?.grants.filter(g => g.status === "active" && Date.parse(g.expiresAt) > Date.now()) ?? [];
  const sentBefore = Boolean(participation?.contributions.some(contribution => contribution.actorEmail === participation.currentActorEmail));
  const otherSources = sources.filter(source => source.id !== workId);

  return <div className={styles.body} aria-busy={busy}>
    {error ? <XaNote role="alert" tone="down">{error}</XaNote> : null}
    {notice ? <XaNote role="status" tone="done">{notice}</XaNote> : null}
    {retryContribution ? <div className={styles.row}><XaNote tone="waits">Your proposal wasn&apos;t confirmed. Retry this same proposal so it isn&apos;t sent twice.</XaNote><XaButton variant="secondary" size="sm" disabled={busy} onClick={() => void change("participation", retryContribution)}>Retry contribution</XaButton><XaButton variant="quiet" size="sm" disabled={busy} onClick={() => { setRetryContribution(null); setGeneration(value => value + 1); }}>Review current contributions</XaButton></div> : null}
    {!context && !contextError && !contextDenied || !participation && !participationError ? <p role="status" className={styles.quiet}><XaStatus kind="working" size="sm">Reading who can work on this</XaStatus></p> : null}

    {participation && ownGrant ? <XaBlock label={sentBefore ? "Send another proposal" : "Your proposal"}>
      <form className={styles.form} aria-label="Submit a contribution" onSubmit={event => {
        event.preventDefault(); const form = new FormData(event.currentTarget);
        void change("participation", { kind: "contribute", expectedRevision: participation.revision, grantId: ownGrant.id, baseWorkRevision: participation.workRevision, summary: form.get("summary"), content: form.get("content"), costMinor: Math.round(Number(form.get("cost") || 0) * 100), idempotencyKey: crypto.randomUUID() });
      }}>
        <XaField label="What changed?" name="summary" maxLength={500} required placeholder="Shorter opening paragraph" />
        <XaTextArea label="Your proposal" name="content" rows={6} maxLength={20000} required />
        <XaField label="What it cost you, in dollars" name="cost" type="number" min={0} max={ownGrant.budgetMinor / 100} step="0.01" defaultValue="0" required hint={`Up to ${(ownGrant.budgetMinor / 100).toFixed(2)}. The person who shared this with you is named as its sponsor.`} />
        <div className={styles.row}><XaButton type="submit" variant="primary" size="lg" busy={busy} disabled={busy || Boolean(retryContribution)}>Submit for review</XaButton></div>
        <XaNote>It is reviewed before the work changes.</XaNote>
      </form>
    </XaBlock> : null}

    {participation?.contributions.length ? <XaBlock label="Contributions" id="work-contributions">
      <ul className={styles.list} aria-label="Contributions">{participation.contributions.map(contribution => <li key={contribution.id} className={styles.contribution}>
        <div className={styles.contributionHead}>
          <XaInitial name={contribution.actorEmail} shape="round" size={28} />
          <div className={styles.grow}><p className={styles.title}>{contribution.summary}</p><p className={styles.meta}>{contribution.actorEmail} · Reported cost {contribution.costMinor === null ? "unknown" : `${(contribution.costMinor / 100).toFixed(2)} ${contribution.currency}`}</p></div>
          {contribution.status === "pending" ? <XaStatus kind="waits" size="sm">{CONTRIBUTION_WORD.pending}</XaStatus> : <span className={styles.meta}>{CONTRIBUTION_WORD[contribution.status]}</span>}
        </div>
        <p className={styles.content}>{contribution.content}</p>
        {contribution.reviewReason ? <p className={styles.meta}>Review: {contribution.reviewReason}</p> : null}
        {canManage && contribution.status === "pending" ? <form className={styles.form} onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null; void change("participation", { kind: "review", expectedRevision: participation.revision, contributionId: contribution.id, decision: submitter?.value === "reject" ? "reject" : "accept", reason: form.get("reason") }); }}>
          <XaField label="Why" name="reason" maxLength={1000} required />
          <div className={styles.row}><XaButton type="submit" value="accept" variant="secondary" disabled={busy}>Accept proposal</XaButton><XaButton type="submit" value="reject" variant="quiet" disabled={busy}>Request revision</XaButton></div>
          <XaNote>Accepting records your review. Applying it still goes through this work&apos;s normal edit and approval.</XaNote>
        </form> : null}
      </li>)}</ul>
    </XaBlock> : null}

    <XaBlock label="Who can contribute" action={canManage && participation && !inviting ? <XaTextLink onClick={() => setInviting(true)}>Invite someone</XaTextLink> : undefined}>
      {participationError ? <XaNote tone="down">{participationError}</XaNote> : null}
      {participation && !activeGrants.length ? <XaNote>No one outside has access right now.</XaNote> : null}
      {activeGrants.length ? <ul className={styles.list} aria-label="Work collaborators">{activeGrants.map(grant => <li key={grant.id} className={styles.person}>
        <XaInitial name={grant.participantEmail} shape="round" size={28} />
        <div className={styles.grow}><p className={styles.title}>{grant.participantEmail}</p><p className={styles.meta}>{grant.participantKind === "agent" ? "Sponsored agent account" : "Collaborator"} · until {date(grant.expiresAt)} · {grant.purpose}</p></div>
        {canManage ? <XaButton variant="quiet" size="sm" disabled={busy} onClick={() => void change("participation", { kind: "revoke", expectedRevision: participation!.revision, grantId: grant.id })}>Revoke access</XaButton> : null}
      </li>)}</ul> : null}
      {canManage && activeGrants.length ? <p className={styles.quiet}><XaTextLink href={`/workspace/contribute/${encodeURIComponent(workId)}`}>Open the contribution link</XaTextLink> · only the verified accounts you add can use it.</p> : null}
      {canManage && participation && inviting ? <form className={styles.form} aria-label="Invite a contribution" onSubmit={event => {
        event.preventDefault(); const form = new FormData(event.currentTarget);
        void change("participation", { kind: "grant", expectedRevision: participation.revision, participantEmail: form.get("email"), participantKind: form.get("agent") ? "agent" : "person", scope: ["read", "propose"], purpose: form.get("purpose"), expiresAt: sevenDays(), budgetMinor: Math.round(Number(form.get("budget") || 0) * 100), currency: "USD" });
      }}>
        <XaField label="Their email" name="email" type="email" required />
        <XaField label="What should they contribute?" name="purpose" maxLength={1000} required />
        <XaField label="Most they may report as cost, in dollars" name="budget" type="number" min={0} max={1000000} step="0.01" defaultValue="0" required />
        <label className={styles.check}><input name="agent" type="checkbox" /><span>This is a sponsored agent account</span></label>
        <XaNote>For seven days they can read this work and send a proposal. You review it. This doesn&apos;t approve a payment or run an outside agent.</XaNote>
        <div className={styles.row}><XaButton type="submit" variant="secondary" disabled={busy}>Grant access to this work</XaButton><XaButton variant="quiet" disabled={busy} onClick={() => setInviting(false)}>Cancel</XaButton></div>
      </form> : null}
    </XaBlock>

    {!contextDenied ? <XaBlock label="Other sources it may use" action={canManage && context && otherSources.length && !allowing ? <XaTextLink onClick={() => setAllowing(true)}>Allow another source</XaTextLink> : undefined}>
      {contextError ? <XaNote tone="down">{contextError}</XaNote> : null}
      {context && !context.grants.length ? <XaNote>No other sources are allowed here.</XaNote> : null}
      {context?.grants.length ? <ul className={styles.list} aria-label="Sources for this work">{context.grants.map(grant => <li key={grant.id} className={styles.person}>
        <div className={styles.grow}><p className={styles.title}>{grant.title}</p><p className={styles.meta}>{grant.status === "revoked" ? "Access removed" : Date.parse(grant.expiresAt) <= Date.now() ? "Access ended" : `Allowed until ${date(grant.expiresAt)}`}</p></div>
        {canManage && grant.status === "active" ? <XaButton variant="quiet" size="sm" disabled={busy} onClick={() => void change("context", { kind: "revoke_source", expectedRevision: context.revision, grantId: grant.id })}>Remove access</XaButton> : null}
      </li>)}</ul> : null}
      {context?.facts.length ? <ul className={styles.list}>{context.facts.map(fact => <li key={fact.id} className={styles.fact}><p className={styles.title}>{fact.key}: {fact.value}</p><p className={styles.meta}>From {fact.excerpt} · captured {date(fact.capturedAt)}</p></li>)}</ul> : null}
      {canManage && context && allowing ? <form className={styles.form} aria-label="Allow another source" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void change("context", { kind: "grant_source", expectedRevision: context.revision, sourceWorkId: form.get("source"), scope: ["read", "use_in_work"], purpose: "Use this source to complete the selected work", expiresAt: sevenDays() }); }}>
        <div className={styles.selectField}><label htmlFor={`source-${workId}`}>Saved source</label><select id={`source-${workId}`} name="source" required>{otherSources.map(source => <option key={source.id} value={source.id}>{source.title ?? "Untitled work"}</option>)}</select></div>
        <XaNote>Allows this exact saved state for seven days. If it changes, it needs a fresh yes.</XaNote>
        <div className={styles.row}><XaButton type="submit" variant="secondary" disabled={busy}>Allow source for this work</XaButton><XaButton variant="quiet" disabled={busy} onClick={() => setAllowing(false)}>Cancel</XaButton></div>
      </form> : null}
    </XaBlock> : null}

    <PersonalAiAccessControl key={workId} workId={workId} canManage={canManage} participationRevision={participation?.revision ?? null} hasContributions={Boolean(participation?.contributions.length)} onAuthorityChanged={() => setGeneration(value => value + 1)} />
    {contextError || participationError ? <div><XaButton variant="secondary" size="sm" disabled={busy} onClick={() => setGeneration(value => value + 1)}>Reload work access</XaButton></div> : null}
  </div>;
}
