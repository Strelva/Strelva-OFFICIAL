"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { XaButton, XaButtonLink, XaDecision, XaEmpty, XaField, XaHeadline, XaSelect, XaStatus, XaTextArea, XaTextLink, XaWorking, XaYes } from "@/components/ui/strelva/Xa";
import { XaBlock, XaCrumbs, XaNote, XaObjectPage, XaSteps } from "@/components/ui/strelva/Xa";
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
  return value ? new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).replace(":00", "") : "Not started";
}

/** Scope ids ("website_delivery") as words a person reads ("Website delivery"). */
export function scopeWords(scope: readonly string[]): string {
  return scope.map(item => { const words = item.replace(/[_-]+/g, " ").trim(); return words.charAt(0).toUpperCase() + words.slice(1); }).join(", ");
}

/** Where a delivery stands, in one sentence that names whose move it is (by name when known). */
export function deliverySentence(commitment: DeliveryCommitment | null | undefined, item: Pick<ServiceRequest, "status" | "providerAcceptance">, viewer: "business" | "agency" | "either" = "either", now = Date.now(), names: { askedBy?: string | null; agency?: string | null } = {}): string {
  const owner = names.askedBy ?? "the business";
  const agency = names.agency ?? "the agency";
  const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
  if (!commitment) return item.status === "draft" ? "A draft. It hasn't been sent yet." : item.status === "withdrawn" ? "Withdrawn. What was recorded stays." : item.providerAcceptance.status === "declined" ? `${cap(agency)} said no to this one.` : item.providerAcceptance.status === "accepted" ? `${cap(agency)} took it and is working out the scope.` : `Waiting on ${agency} to look at it.`;
  if (commitment.status === "proposed") return viewer === "business" ? `${cap(agency)} sent the scope. It waits for your yes.` : `Waiting on ${owner} to agree the scope.`;
  if (commitment.status === "accepted") return viewer === "business" ? "Done. You accepted it." : `Done. ${cap(owner)} accepted it.`;
  if (commitment.status === "cancelled") return "Cancelled. What was recorded stays.";
  if (commitment.status === "submitted") return viewer === "business" ? "It's ready for you to look at." : `Waiting on ${owner} to review.`;
  const late = commitment.dueAt !== null && Date.parse(commitment.dueAt) <= now;
  if (commitment.status === "changes_requested") return late ? "Changes were asked for, and it's past due." : viewer === "business" ? `You asked for changes. ${cap(agency)} is on it.` : `${cap(owner)} asked for changes.`;
  if (commitment.blocker) return late ? "Blocked, and it's past due." : `Blocked: ${commitment.blocker.note.replace(/\.$/, "")}.`;
  return late ? "It's past due." : viewer === "business" ? `${cap(agency)} is working on it.` : "In progress.";
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
    { title: "Asked", state: item.status === "draft" ? pending : "done" as StepState, time: item.status === "draft" ? undefined : displayDate(item.createdAt), detail: item.status === "draft" ? "Not sent yet." : undefined },
    { title: "Scope agreed", state: agreed ? "done" as StepState : current(commitment?.status === "proposed"), time: commitment?.customerAcceptedAt ? displayDate(commitment.customerAcceptedAt) : undefined, detail: agreed ? undefined : "Work starts once the scope is agreed." },
    { title: "In progress", state: submitted || accepted ? "done" as StepState : current(began), time: commitment?.startedAt ? displayDate(commitment.startedAt) : undefined, detail: commitment?.blocker?.note },
    { title: "Ready to review", state: accepted ? "done" as StepState : current(commitment?.status === "submitted"), time: commitment?.result ? displayDate(commitment.result.submittedAt) : undefined, detail: commitment?.status === "changes_requested" ? "Changes were asked for." : undefined },
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
  const [cancelling, setCancelling] = useState(false);
  const [cancelNote, setCancelNote] = useState("");
  const [blocking, setBlocking] = useState(false);
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
      setNotice("Saved.");
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
  const people = inspection.people;
  const viewer = inspection.permissions.canManage ? "business" : inspection.permissions.canOperate ? "agency" : "either";
  const doer = commitment ? commitment.operatorId === inspection.actorId ? "You" : people.operator ? `${people.operator}${people.agency ? ` at ${people.agency}` : ""}` : people.agency ?? "Your agency" : people.agency ?? "Your agency";
  const due = commitment?.dueAt ? shortWhen(commitment.dueAt) : null;
  const decides = actions.some(action => ["blocker", "accept_result", "request_changes", "cancel"].includes(action));
  const steps = requestProgress(item).map((step, index) => ({ key: String(index), title: step.title, state: step.state as StepState, time: step.state === "active" ? step.time : undefined, detail: step.state === "active" ? step.detail : undefined }));
  const reviewing = actions.includes("accept_result");

  const head = <>
    <XaCrumbs items={[{ label: "Requests", href: `/workspace?workspaceId=${encodeURIComponent(item.businessId)}&view=requests` }, { label: item.outcome }]} />
    <XaHeadline quiet={deliverySentence(commitment, item, viewer, Date.now(), { askedBy: people.askedBy, agency: people.agency })}><span id="delivery-title">{item.outcome}.</span></XaHeadline>
  </>;
  const story = <>
    {error ? <XaNote role="alert" tone="down">{error}</XaNote> : null}
    {notice ? <XaNote role="status" tone="done">{notice}</XaNote> : null}
    {pending ? <XaNote tone="waits">Your last change wasn&apos;t confirmed. <XaTextLink onClick={() => void submit()}>{saving ? "Sending it again" : "Send the same change again"}</XaTextLink></XaNote> : null}
    {inspection.permissions.stopped ? <XaNote tone="waits">New work is stopped for this business. What&apos;s here stays.</XaNote> : null}
    {!inspection.permissions.canManage && !inspection.permissions.canOperate ? <XaNote>You can read this. The people who run it make the decisions.</XaNote> : null}
    <p className={styles.lead}>{commitment?.deliveryDefinition || item.request}</p>
    {commitment ? <XaNote>{doer === "You" ? "You're" : `${doer} is`} doing it{commitment.termsReference ? `, under ${commitment.termsReference}` : ""}.</XaNote> : null}
    <XaSteps label="Where it is" steps={steps} />
    {commitment?.decision ? <XaNote>{people.askedBy ?? "The business"}: “{commitment.decision.note}”</XaNote> : null}
    {inspection.codeAgent && (inspection.permissions.canOperate || inspection.permissions.canManage) ? <CodeAgentHandoff mcpUrl={inspection.codeAgent.mcpUrl} requestId={inspection.codeAgent.requestId} /> : null}
    {inspection.permissions.canOperate && commitment && ["running", "changes_requested"].includes(commitment.status) && !inspection.permissions.websiteBindings.length ? <XaNote role="status" tone="waits">This client&apos;s website isn&apos;t connected yet. Connect it in the client&apos;s settings, then submit.</XaNote> : null}
    {actions.includes("cancel") && !inspection.permissions.canOperate ? <p className={styles.copyNote}><XaTextLink onClick={() => setCancelling(value => !value)}>Cancel this Request</XaTextLink></p> : null}
    {cancelling && actions.includes("cancel") ? <form className={styles.form} onSubmit={event => { event.preventDefault(); void submit({ kind: "cancel", note: cancelNote.trim() || "Cancelled." }); }}>
      <XaTextArea label="Why, for the agency (optional)" maxLength={1000} value={cancelNote} disabled={disabled} onChange={event => setCancelNote(event.target.value)} />
      <p className={styles.copyNote}><XaTextLink onClick={() => void submit({ kind: "cancel", note: cancelNote.trim() || "Cancelled." })}>Cancel it</XaTextLink> · <XaTextLink onClick={() => setCancelling(false)}>Keep it</XaTextLink></p>
      <XaNote>Everything recorded stays. Nothing on your website changes and nothing is refunded here.</XaNote>
    </form> : null}
    <p className={styles.copyNote}><XaTextLink onClick={() => void load()}>Check again</XaTextLink></p>
    {children}
  </>;

  const result = commitment?.result ? <XaBlock label={reviewing ? "What came back" : "What was delivered"}>
    {safeReviewUrl ? <p className={styles.copyNote}><XaTextLink href={safeReviewUrl}>Open the new page</XaTextLink></p> : <XaNote tone="down">The link that came back isn&apos;t safe to open.</XaNote>}
    {people.viewerIsAgencyOperator ? <p className={styles.copyNote}>{commitment.result.repository} at {commitment.result.commitSha.slice(0, 7)}</p> : null}
    <XaNote>{people.operator ?? people.agency ?? "The agency"} checked it on a computer and a phone and tried the main button. It isn&apos;t on your live address until it&apos;s published.</XaNote>
  </XaBlock> : null;

  const object = actions.includes("propose") ? <XaDecision label="Propose the delivery" status={<XaStatus kind="draft">Not sent yet</XaStatus>} meta={`${people.askedBy ?? "The business"} agrees first`} yes={null}>
    <form className={styles.form} onSubmit={event => { event.preventDefault(); void submit({ kind: "propose", termsReference: terms, deliveryDefinition: definition, inputsReady: true }); }}>
      <XaTextArea label="Exactly what you'll deliver" maxLength={1000} required value={definition} disabled={disabled} onChange={event => setDefinition(event.target.value)} />
      <XaField label="Under which agreement" maxLength={500} required value={terms} disabled={disabled} onChange={event => setTerms(event.target.value)} placeholder="North Studio care plan, October" />
      <label className={styles.check}><input type="checkbox" checked={ready} disabled={disabled} onChange={event => setReady(event.target.checked)} /><span>I have what I need and can start today.</span></label>
      <XaNote>When {people.askedBy ?? "the business"} agrees, you have 24 hours. Agreeing doesn&apos;t approve a charge or publish anything.</XaNote>
      <XaButton type="submit" variant="primary" size="lg" busy={saving} disabled={Boolean(pending) || !ready || !terms.trim() || !definition.trim()}>Send to {people.askedBy ?? "the business"}</XaButton>
    </form>
  </XaDecision>
    : actions.includes("agree") ? <XaDecision label="Agree the scope" status={<XaStatus kind="waits">Waiting on you</XaStatus>} meta={people.agency ?? undefined}
      yes={<XaYes state={saving ? "going" : "waiting"} yesLabel="Agree and start" onYes={() => void submit({ kind: "agree" })} disabledReason={pending ? "Send your last change again first." : undefined} />}>
      <p className={styles.lead}>{commitment?.deliveryDefinition}</p>
      <XaNote>{people.operator ?? people.agency ?? "Your agency"} starts as soon as you agree and has 24 hours. Agreeing doesn&apos;t approve a charge or publish anything.</XaNote>
    </XaDecision>
      : actions.includes("submit") ? <XaDecision label="Submit the built page" status={<XaStatus kind="working">In progress</XaStatus>} meta={due ? `Due ${due}` : undefined} yes={null}>
        <form className={styles.form} onSubmit={event => { event.preventDefault(); void submit({ kind: "submit", result: { websiteBindingId: bindingId, repository, commitSha, reviewUrl, desktopChecked: true, mobileChecked: true, primaryActionChecked: true } }); }}>
          <XaSelect label="Client website" required value={bindingId} disabled={disabled} placeholder="Choose the website" options={inspection.permissions.websiteBindings.map(binding => ({ value: binding.id, label: binding.name || "Unnamed website" }))} onChange={event => setBindingId(event.target.value)} />
          <XaField label="Repository, owner/name" required maxLength={201} value={repository} disabled={disabled} onChange={event => setRepository(event.target.value)} />
          <XaField label="Full commit" required maxLength={40} value={commitSha} disabled={disabled} onChange={event => setCommitSha(event.target.value)} />
          <XaField label="Where to look at it (https)" type="url" required maxLength={2048} value={reviewUrl} disabled={disabled} onChange={event => setReviewUrl(event.target.value)} hint="No passwords or bypass tokens in the link." />
          <fieldset className={styles.checks}><legend>You checked it on</legend>
            {([["A computer", desktop, setDesktop], ["A phone", mobile, setMobile], ["Its main button", primaryAction, setPrimaryAction]] as const).map(([label, checked, setter]) => <label key={label} className={styles.check}><input type="checkbox" disabled={disabled} checked={checked} onChange={event => setter(event.target.checked)} /><span>{label}</span></label>)}
          </fieldset>
          {actions.includes("blocker") ? <p className={styles.copyNote}><XaTextLink onClick={() => setBlocking(value => !value)}>{commitment?.blocker ? "Change what's blocking it" : "Something's blocking it"}</XaTextLink>{commitment?.blocker ? <> · <XaTextLink onClick={() => void submit({ kind: "blocker", note: null })}>It&apos;s unblocked</XaTextLink></> : null}</p> : null}
          {blocking ? <div className={styles.form}><XaTextArea label="What's blocking it" maxLength={1000} value={note} disabled={disabled} onChange={event => setNote(event.target.value)} /><p className={styles.copyNote}><XaTextLink onClick={() => { if (note.trim()) void submit({ kind: "blocker", note }); }}>Save it</XaTextLink></p></div> : null}
          <XaButton type="submit" variant="primary" size="lg" busy={saving} disabled={Boolean(pending) || !bindingId || !desktop || !mobile || !primaryAction}>Send to {people.askedBy ?? "the business"}</XaButton>
        </form>
      </XaDecision>
        : decides ? <XaDecision label="Your decision" status={reviewing ? <XaStatus kind="waits">Waiting on you</XaStatus> : commitment?.blocker ? <XaStatus kind="waits">Blocked</XaStatus> : <XaStatus kind="working">In progress</XaStatus>} meta={due ? `Due ${due}` : undefined}
          yes={reviewing ? <XaYes state={saving ? "going" : "waiting"} yesLabel="Accept it" onYes={() => void submit({ kind: "accept_result", note: note.trim() || "Accepted without a note." })} disabledReason={pending ? "Send your last change again first." : undefined} /> : null}>
          {result}
          {commitment?.blocker ? <XaNote tone="waits">{commitment.blocker.note}.</XaNote> : null}
          {reviewing ? <>
            <XaTextArea label={`A note for ${people.operator ?? people.agency ?? "the agency"} (optional)`} maxLength={1000} value={note} disabled={disabled} onChange={event => setNote(event.target.value)} />
            {actions.includes("request_changes") ? <p className={styles.copyNote}><XaTextLink onClick={() => { if (note.trim()) void submit({ kind: "request_changes", note }); else setError("Say what should change in the note first."); }}>Ask for changes instead</XaTextLink></p> : null}
          </> : actions.includes("blocker") ? <div className={styles.form}>
            <XaTextArea label="What's blocking it" maxLength={1000} value={note} disabled={disabled} onChange={event => setNote(event.target.value)} />
            <p className={styles.copyNote}><XaTextLink onClick={() => { if (note.trim()) void submit({ kind: "blocker", note }); }}>Save it</XaTextLink>{commitment?.blocker ? <> · <XaTextLink onClick={() => void submit({ kind: "blocker", note: null })}>It&apos;s unblocked</XaTextLink></> : null}</p>
          </div> : null}
        </XaDecision>
          : result ? <XaDecision label="What was delivered" status={commitment?.status === "accepted" ? <XaStatus kind="live">Accepted</XaStatus> : <XaStatus kind="waits">Waiting on {people.askedBy ?? "the business"}</XaStatus>} yes={null}>{result}</XaDecision> : undefined;

  return <XaObjectPage label={item.outcome} phone="object-first" head={head} story={story} object={object} />;
}

function shortWhen(value: string): string {
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).replace(":00", "");
}
