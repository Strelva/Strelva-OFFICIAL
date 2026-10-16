"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { XaAnswers, XaButton, XaButtonLink, XaDecision, XaEmpty, XaField, XaHeadline, XaStatus, XaTextArea, XaTextLink, XaWorking, XaYes } from "@/components/ui/strelva/Xa";
import { XaBlock, XaCrumbs, XaNote, XaObjectPage, XaSteps } from "@/experience/xa-object/XaObjectPage";
import type { DeliveryCommitment } from "@/platform/service-requests/delivery-commitment";

type StepState = "done" | "active" | "pending";
import type { ServiceRequest } from "@/platform/service-requests/types";
import styles from "./delivery-panel.module.css";
import { deliveryCommitmentCommandSchema, deliveryReviewUrlSchema } from "@/platform/service-requests/delivery-commitment";
import { serviceRequestSchema } from "@/platform/service-requests/types";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";
import { CodeAgentHandoff } from "./CodeAgentHandoff";
import { deliveryActions, deliveryCommandKey, deliveryInspectionSchema, retainedDeliveryCommand, type DeliveryChange, type DeliveryCommand, type DeliveryInspection } from "./delivery-client";

function errorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const error = (body as { error?: { message?: unknown } }).error;
  return typeof error?.message === "string" ? error.message : fallback;
}
function displayDate(value: string | null): string {
  return value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "Not started";
}

/** Scope ids ("website_delivery") as words a person reads ("Website delivery"). */
export function scopeWords(scope: readonly string[]): string {
  return scope.map(item => { const words = item.replace(/[_-]+/g, " ").trim(); return words.charAt(0).toUpperCase() + words.slice(1); }).join(", ");
}

/** Where a delivery stands, in one sentence that names whose move it is. */
export function deliverySentence(commitment: DeliveryCommitment | null | undefined, item: Pick<ServiceRequest, "status" | "providerAcceptance">, viewer: "business" | "agency" | "either" = "either", now = Date.now()): string {
  if (!commitment) return item.status === "draft" ? "A draft. It hasn't been asked yet." : item.status === "withdrawn" ? "Withdrawn. Its records are kept." : item.providerAcceptance.status === "declined" ? "The agency declined it." : item.providerAcceptance.status === "accepted" ? "The agency took it for review. No clock has started." : "Waiting for the agency to review it.";
  if (commitment.status === "proposed") return viewer === "business" ? "Scope and terms wait for your yes." : "Scope and terms wait for the business to accept them.";
  if (commitment.status === "accepted") return "Done. The business accepted the result.";
  if (commitment.status === "cancelled") return "Cancelled. Its records are kept.";
  if (commitment.status === "submitted") return viewer === "business" ? "Ready for you to review." : "Ready for the business to review.";
  const late = commitment.dueAt !== null && Date.parse(commitment.dueAt) <= now;
  if (commitment.status === "changes_requested") return late ? "Changes asked for, and the original deadline has passed." : viewer === "business" ? "You asked for changes." : "The business asked for changes.";
  if (commitment.blocker) return late ? "Blocked, and the deadline has passed." : "Blocked. The deadline hasn't moved.";
  return late ? "Past its deadline." : "In progress.";
}

/** Only retained dates mark completed stages; a proposed scope is never agreed work. */
export function requestProgress(item: ServiceRequest) {
  const commitment = item.deliveryCommitment;
  const closed = item.status === "withdrawn" || item.providerAcceptance.status === "declined" || commitment?.status === "cancelled";
  const accepted = commitment?.status === "accepted";
  const agreed = Boolean(commitment?.customerAcceptedAt);
  const began = Boolean(commitment?.startedAt);
  const submitted = Boolean(commitment?.result) && commitment?.status !== "changes_requested";
  const pending: StepState = "pending";
  const current = (active: boolean): StepState => !closed && active ? "active" : pending;
  return [
    { title: "Asked", state: item.status === "draft" ? pending : "done" as StepState, time: item.status === "draft" ? undefined : displayDate(item.createdAt), detail: item.status === "draft" ? "Draft request. It has not been asked yet." : item.request },
    { title: "Scope and date agreed", state: agreed ? "done" as StepState : current(commitment?.status === "proposed"), time: commitment?.customerAcceptedAt ? displayDate(commitment.customerAcceptedAt) : undefined, detail: agreed ? `Original deadline: ${displayDate(commitment?.dueAt ?? null)}` : "Scope and deadline need acceptance before work begins." },
    { title: "In progress", state: submitted || accepted ? "done" as StepState : current(began), time: commitment?.startedAt ? displayDate(commitment.startedAt) : undefined, detail: commitment?.blocker?.note },
    { title: "Ready for review", state: accepted ? "done" as StepState : current(commitment?.status === "submitted"), time: commitment?.result ? displayDate(commitment.result.submittedAt) : undefined, detail: commitment?.status === "changes_requested" ? "Changes requested. The original deadline is unchanged." : undefined },
    { title: closed ? "Closed" : "Done", state: closed || accepted ? "done" as StepState : pending, time: commitment?.decision ? displayDate(commitment.decision.at) : undefined },
  ];
}

/** Uses the existing delivery API. Browser affordances never grant authority. */
export function DeliveryCommitmentPanel({ requestId, children }: { requestId: string; children?: ReactNode }) {
  const transport = useWorkspaceRequest();
  const [inspection, setInspection] = useState<DeliveryInspection | null>(null);
  const [pending, setPending] = useState<DeliveryCommand | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [signIn, setSignIn] = useState(false);
  const [terms, setTerms] = useState("");
  const [definition, setDefinition] = useState("");
  const [ready, setReady] = useState(false);
  const [note, setNote] = useState("");
  const [bindingId, setBindingId] = useState("");
  const [repository, setRepository] = useState("");
  const [commitSha, setCommitSha] = useState("");
  const [reviewUrl, setReviewUrl] = useState("");
  const [desktop, setDesktop] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [primaryAction, setPrimaryAction] = useState(false);
  const generation = useRef(0);
  const mutation = useRef(false);

  const load = useCallback(async () => {
    const version = ++generation.current;
    setLoading(true); setError(""); setSignIn(false); setInspection(null);
    try {
      const response = await transport(`/api/service-requests/delivery?requestId=${encodeURIComponent(requestId)}`, { cache: "no-store" });
      if (version !== generation.current) return;
      if (response.redirected && new URL(response.url).pathname.startsWith("/sign-in")) { setSignIn(true); setInspection(null); throw new Error("Sign in again to continue with the retained request."); }
      const body: unknown = await response.json().catch(() => null);
      if (version !== generation.current) return;
      if (!response.ok) {
        setSignIn(response.status === 401);
        throw new Error(errorMessage(body, "Delivery could not be loaded. Your saved request has not been changed."));
      }
      const parsed = deliveryInspectionSchema.safeParse(body);
      if (!parsed.success) throw new Error("Delivery state could not be confirmed.");
      const value = parsed.data;
      if (value.request.id !== requestId) throw new Error("The returned delivery does not match this request.");
      setInspection(value);
      try { setPending(retainedDeliveryCommand(sessionStorage.getItem(deliveryCommandKey(value.actorId, requestId)), requestId)); }
      catch { setPending(null); }
    } catch (cause) {
      if (version === generation.current) setError(cause instanceof Error ? cause.message : "Delivery could not be loaded.");
    } finally { if (version === generation.current) setLoading(false); }
  }, [requestId, transport]);

  useEffect(() => { void load(); return () => { generation.current += 1; }; }, [load]);

  async function submit(change?: DeliveryChange) {
    if (!inspection || mutation.current || (pending && change)) return;
    const current = inspection;
    const version = generation.current;
    const storageKey = deliveryCommandKey(current.actorId, requestId);
    let command: DeliveryCommand;
    try {
      command = pending ?? deliveryCommitmentCommandSchema.parse({ action: "delivery_commitment", requestId,
        expectedRevision: current.request.revision, idempotencyKey: crypto.randomUUID(), change });
      // Save the exact command before sending. A lost response can be retried
      // after a reload without changing the revision, key, or result evidence.
      sessionStorage.setItem(storageKey, JSON.stringify(command));
    } catch { setError("The command could not be retained. Check the fields and allow session storage before continuing. Nothing was sent."); return; }
    mutation.current = true; setPending(command); setSaving(true); setError(""); setNotice("");
    try {
      const response = await transport("/api/service-requests/delivery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) });
      if (version !== generation.current) return;
      if (response.redirected && new URL(response.url).pathname.startsWith("/sign-in")) { setSignIn(true); setInspection(null); throw new Error("Sign in again to continue with the retained request."); }
      const body: unknown = await response.json().catch(() => null);
      if (version !== generation.current) return;
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status)) {
          sessionStorage.removeItem(storageKey); setPending(null);
          if ([401, 403, 404].includes(response.status)) { setInspection(null); setSignIn(response.status === 401); }
        }
        throw new Error(errorMessage(body, "The outcome is not confirmed. Retry the retained command, not a new delivery."));
      }
      const saved = serviceRequestSchema.parse((body as { request?: unknown } | null)?.request);
      if (saved.id !== requestId || saved.businessId !== current.request.businessId) throw new Error("The delivery response could not be confirmed.");
      sessionStorage.removeItem(storageKey); setPending(null);
      setNotice("Saved. Publication, billing, and agency access are unchanged.");
      await load();
    } catch (cause) {
      if (version === generation.current) setError(cause instanceof Error ? cause.message : "The outcome is uncertain. Retry the retained command.");
    } finally { mutation.current = false; if (version === generation.current || version + 1 === generation.current) setSaving(false); }
  }

  if (loading) return <XaObjectPage story={<XaWorking title="Opening the Request" steps={[{ id: "read", label: "Reading the saved delivery and your permissions", state: "active" }]} />} />;
  if (!inspection || inspection.request.id !== requestId) return <XaObjectPage story={<div role="alert"><XaEmpty pose="fixing" title="This Request couldn't be opened" job="Your saved Request hasn't changed."
    action={signIn ? <XaButtonLink variant="primary" size="lg" href={`/sign-in?next=${encodeURIComponent(`/workspace/delivery/${requestId}`)}`}>Sign in to review this delivery</XaButtonLink> : <XaButton variant="primary" size="lg" onClick={() => void load()}>Check again</XaButton>}>{error || "This delivery is unavailable."}</XaEmpty></div>} />;
  const item = inspection.request;
  const commitment = item.deliveryCommitment;
  const actions = deliveryActions(inspection);
  const disabled = saving || Boolean(pending);
  const safeReviewUrl = commitment?.result && deliveryReviewUrlSchema.safeParse(commitment.result.reviewUrl).success ? commitment.result.reviewUrl : null;
  const decides = actions.some(action => ["blocker", "accept_result", "request_changes", "cancel"].includes(action));
  const steps = requestProgress(item).map((step, index) => ({ key: String(index), title: step.title, state: step.state as StepState, time: step.time, detail: step.detail }));

  const story = <>
    <XaCrumbs items={[{ label: "Requests", href: `/workspace?workspaceId=${encodeURIComponent(item.businessId)}&view=requests` }, { label: item.outcome }]} />
    <XaHeadline quiet={deliverySentence(commitment, item, inspection.permissions.canManage ? "business" : inspection.permissions.canOperate ? "agency" : "either")}><span id="delivery-title">{item.outcome}</span></XaHeadline>
    {error ? <XaNote role="alert" tone="down">{error}</XaNote> : null}
    {notice ? <XaNote role="status" tone="done">{notice}</XaNote> : null}
    {pending ? <div className={styles.inline}><XaNote tone="waits">A previous command is not confirmed. Retry that exact command before making another change.</XaNote><XaButton variant="secondary" size="sm" disabled={saving} onClick={() => void submit()}>Retry retained command</XaButton></div> : null}
    {inspection.permissions.stopped ? <XaNote tone="waits">New work is stopped for this business. Records stay; only an eligible cancellation can be recorded.</XaNote> : null}
    {!inspection.permissions.canManage && !inspection.permissions.canOperate ? <XaNote>Shared with you. You can read this Request; decisions stay with the people who manage it.</XaNote> : null}
    <XaSteps label="Request progress" steps={steps} />
    <XaAnswers labelWidth={150} rows={[
      [commitment ? "Agreed work" : "Asked for", commitment?.deliveryDefinition || item.request],
      ["Scope", scopeWords(commitment?.scope ?? item.scope)],
      ...(commitment ? [
        ["Agreed terms", commitment.termsReference] as const,
        ["Original deadline", commitment.dueAt ? displayDate(commitment.dueAt) : "Set when the scope is accepted"] as const,
        ["Assigned to", commitment.operatorId === inspection.actorId ? "You" : "A person at the agency"] as const,
      ] : []),
    ]} />
    {commitment?.blocker ? <XaNote tone="waits">{commitment.blocker.note}. The original deadline is unchanged.</XaNote> : null}
    {commitment?.decision ? <XaBlock label="Latest decision from the business"><p className={styles.copyNote}>{commitment.decision.note} · {displayDate(commitment.decision.at)}</p></XaBlock> : null}
    {inspection.codeAgent && (inspection.permissions.canOperate || inspection.permissions.canManage) ? <CodeAgentHandoff mcpUrl={inspection.codeAgent.mcpUrl} requestId={inspection.codeAgent.requestId} /> : null}
    {inspection.permissions.canOperate && commitment && ["running", "changes_requested"].includes(commitment.status) && !inspection.permissions.websiteBindings.length ? <XaNote role="status" tone="waits">No eligible website is connected. Connect the client&apos;s actual website in its business settings before submitting it.</XaNote> : null}
    <p className={styles.copyNote}><XaTextLink onClick={() => void load()}>Refresh saved state</XaTextLink></p>
    {children}
  </>;

  const result = commitment?.result ? <XaBlock label="Submitted website">
    {safeReviewUrl ? <p className={styles.copyNote}><XaTextLink href={safeReviewUrl}>Open the submitted website</XaTextLink></p> : <XaNote tone="down">The saved review link isn&apos;t safe to open.</XaNote>}
    {inspection.permissions.canOperate ? <p className={styles.copyNote}>{commitment.result.repository} at {commitment.result.commitSha.slice(0, 7)}</p> : null}
    <XaNote>The agency checked it on desktop and phone and tried its main action. This is not proof it is published on the final address.</XaNote>
  </XaBlock> : null;

  const object = actions.includes("propose") ? <XaDecision label="Propose the delivery" status={<XaStatus kind="draft">Proposal</XaStatus>} meta="The business accepts it first" yes={null}>
    <form className={styles.form} onSubmit={event => { event.preventDefault(); void submit({ kind: "propose", termsReference: terms, deliveryDefinition: definition, inputsReady: true }); }}>
      <XaField label="Agreed terms reference" maxLength={500} required value={terms} disabled={disabled} onChange={event => setTerms(event.target.value)} placeholder="Quote 42" />
      <XaTextArea label="Exactly what will be delivered" maxLength={1000} required value={definition} disabled={disabled} onChange={event => setDefinition(event.target.value)} />
      <label className={styles.check}><input type="checkbox" checked={ready} disabled={disabled} onChange={event => setReady(event.target.checked)} /><span>What I need is ready and I can take this delivery.</span></label>
      <XaNote>The business accepts this exact proposal, and that starts the 24-hour clock. It doesn&apos;t approve a charge or publishing.</XaNote>
      <XaButton type="submit" variant="primary" size="lg" disabled={disabled || !ready || !terms.trim() || !definition.trim()}>Propose 24-hour delivery</XaButton>
    </form>
  </XaDecision>
    : actions.includes("agree") ? <XaDecision label="Accept the scope" status={<XaStatus kind="waits">Waits for you</XaStatus>} meta={commitment ? `Proposed ${displayDate(commitment.proposedAt)}` : undefined}
      yes={<XaYes state={saving ? "going" : "waiting"} yesLabel="Accept scope and start 24-hour delivery" onYes={() => void submit({ kind: "agree" })} disabledReason={pending ? "Retry the unconfirmed command first." : undefined} />}>
      <p className={styles.lead}>{commitment?.deliveryDefinition}</p>
      <XaNote>Accepting starts a 24-hour delivery now, under {commitment?.termsReference}. It doesn&apos;t approve a charge or publish anything.</XaNote>
    </XaDecision>
      : actions.includes("submit") ? <XaDecision label="Submit the built website" status={<XaStatus kind="working">In progress</XaStatus>} meta={commitment ? `Due ${displayDate(commitment.dueAt)}` : undefined} yes={null}>
        <form className={styles.form} onSubmit={event => { event.preventDefault(); void submit({ kind: "submit", result: { websiteBindingId: bindingId, repository, commitSha, reviewUrl, desktopChecked: true, mobileChecked: true, primaryActionChecked: true } }); }}>
          <div className={styles.selectField}><label htmlFor="delivery-binding">Client website</label><select id="delivery-binding" required value={bindingId} disabled={disabled} onChange={event => setBindingId(event.target.value)}><option value="">Choose a website you may submit to</option>{inspection.permissions.websiteBindings.map(binding => <option key={binding.id} value={binding.id}>{binding.name || "Unnamed website"}</option>)}</select></div>
          <XaField label="Repository, owner/name" required maxLength={201} value={repository} disabled={disabled} onChange={event => setRepository(event.target.value)} />
          <XaField label="Full commit" required maxLength={40} value={commitSha} disabled={disabled} onChange={event => setCommitSha(event.target.value)} />
          <XaField label="Review address (HTTPS)" type="url" required maxLength={2048} value={reviewUrl} disabled={disabled} onChange={event => setReviewUrl(event.target.value)} hint="No passwords or preview-bypass tokens. Connecting a website doesn't approve publishing it." />
          <fieldset className={styles.checks}><legend>Checked before you submit</legend>
            {([["Desktop checked", desktop, setDesktop], ["Mobile checked", mobile, setMobile], ["Primary action checked", primaryAction, setPrimaryAction]] as const).map(([label, checked, setter]) => <label key={label} className={styles.check}><input type="checkbox" disabled={disabled} checked={checked} onChange={event => setter(event.target.checked)} /><span>{label}</span></label>)}
          </fieldset>
          <XaButton type="submit" variant="primary" size="lg" disabled={disabled || !bindingId || !desktop || !mobile || !primaryAction}>Submit for client review</XaButton>
        </form>
      </XaDecision>
        : decides ? <XaDecision label="Decide on the delivery" status={actions.includes("accept_result") ? <XaStatus kind="waits">Ready for your review</XaStatus> : <XaStatus kind="working">In progress</XaStatus>} meta={commitment?.dueAt ? `Original deadline ${displayDate(commitment.dueAt)}` : undefined}
          yes={actions.includes("accept_result") ? <XaYes state={saving ? "going" : "waiting"} yesLabel="Accept delivered result" onYes={() => void submit({ kind: "accept_result", note })} disabledReason={!note.trim() ? "Write a note about the result first." : pending ? "Retry the unconfirmed command first." : undefined} /> : null}>
          {result}
          <XaTextArea label={actions.includes("accept_result") ? "Your note on the result" : "Blocker or decision note"} maxLength={1000} value={note} disabled={disabled} onChange={event => setNote(event.target.value)} />
          <div className={styles.inline}>
            {actions.includes("blocker") ? <><XaButton variant="secondary" size="sm" disabled={disabled || !note.trim()} onClick={() => void submit({ kind: "blocker", note })}>Record blocker</XaButton>{commitment?.blocker ? <XaButton variant="secondary" size="sm" disabled={disabled} onClick={() => void submit({ kind: "blocker", note: null })}>Clear blocker</XaButton> : null}</> : null}
            {actions.includes("request_changes") ? <XaButton variant="secondary" size="sm" disabled={disabled || !note.trim()} onClick={() => void submit({ kind: "request_changes", note })}>Request changes</XaButton> : null}
            {actions.includes("cancel") ? <XaButton variant="quiet" size="sm" disabled={disabled || !note.trim()} onClick={() => void submit({ kind: "cancel", note })}>Cancel this delivery</XaButton> : null}
          </div>
          <XaNote>Cancelling keeps every record. It doesn&apos;t delete the website, refund anything or change existing agreements.</XaNote>
        </XaDecision>
          : result ? <XaDecision label="The delivered website" status={commitment?.status === "accepted" ? <XaStatus kind="live">Accepted</XaStatus> : <XaStatus kind="waits">Ready for review</XaStatus>} yes={null}>{result}</XaDecision> : undefined;

  return <XaObjectPage label={item.outcome} story={story} object={object} />;
}
