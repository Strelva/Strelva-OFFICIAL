"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { StHead, StHold, StMono, StNotice, StPage, StPill, StSection, StSkeleton, StSteps, StSurface, StTextButton, type StepState } from "@/components/ui/strelva/Kit";
import type { ServiceRequest } from "@/platform/service-requests/types";
import styles from "./delivery-panel.module.css";
import { TextInput, TextArea, SelectInput } from "@/components/ui/TextInput";
import { deliveryCommitmentStatus, deliveryCommitmentCommandSchema, deliveryReviewUrlSchema } from "@/platform/service-requests/delivery-commitment";
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

  if (loading) return <StPage><StHead title="Request" /><div role="status" aria-label="Loading the saved delivery and current permissions"><StSkeleton /><StSkeleton width="75%" /></div></StPage>;
  if (!inspection || inspection.request.id !== requestId) return <StPage><StHead title="Request" /><StNotice tone="critical">{error || "This delivery is unavailable."}</StNotice>{signIn ? <Link href={`/sign-in?next=${encodeURIComponent(`/workspace/delivery/${requestId}`)}`}>Sign in to review this delivery</Link> : <StPill variant="soft" onClick={() => void load()}>Check again</StPill>}</StPage>;
  const item = inspection.request;
  const commitment = item.deliveryCommitment;
  const actions = deliveryActions(inspection);
  const disabled = saving || Boolean(pending);
  const safeReviewUrl = commitment?.result && deliveryReviewUrlSchema.safeParse(commitment.result.reviewUrl).success ? commitment.result.reviewUrl : null;
  return <StPage>
    <StHead title={item.outcome} titleId="delivery-title"
      crumb={{ label: "Requests", href: `/workspace?workspaceId=${encodeURIComponent(item.businessId)}&view=requests` }}
      meta={commitment ? deliveryCommitmentStatus(commitment) : item.status === "draft" ? "Draft request. No scope or deadline agreed." : item.providerAcceptance.status === "accepted" ? "Accepted for review. Delivery has not started." : "Waiting for agency review. No scope and deadline agreed."}
    />
    {error ? <StNotice tone="critical">{error}</StNotice> : null}
    {notice ? <StNotice><span role="status">{notice}</span></StNotice> : null}
    {pending ? <StNotice tone="need"><p>A previous command is not confirmed. Retry that exact command before making another change.</p><StPill variant="soft" disabled={saving} onClick={() => void submit()}>Retry retained command</StPill></StNotice> : null}
    {inspection.permissions.stopped ? <StNotice>New work is stopped for this business. Records remain available; only an eligible cancellation can be recorded.</StNotice> : null}
    {!inspection.permissions.canManage && !inspection.permissions.canOperate ? <StNotice>Shared with you. You can read this request; decisions stay with the people who manage it.</StNotice> : null}
    <div className={styles.detailColumns}>
      <StSteps label="Request progress" steps={requestProgress(item)} />
      <div className={styles.detailStack}>
        <StSurface label="Request scope">
          <dl className={styles.scope}>
            <div><dt>{commitment ? "In" : "Asked for"}</dt><dd>{commitment?.deliveryDefinition || item.request}</dd></div>
            <div><dt>Scope</dt><dd><StMono>{(commitment?.scope ?? item.scope).join(", ")}</StMono></dd></div>
            {commitment ? <><div><dt>Agreed terms reference</dt><dd>{commitment.termsReference}</dd></div><div><dt>Original deadline</dt><dd><StMono>{displayDate(commitment.dueAt)}</StMono></dd></div><div><dt>Assigned person</dt><dd><StMono>{commitment.operatorId}</StMono></dd></div></> : null}
            <div><dt>Request revision</dt><dd><StMono>{item.revision}</StMono></dd></div>
          </dl>
        </StSurface>
        {commitment?.blocker ? <StNotice tone="need">{commitment.blocker.note}. The original deadline is unchanged.</StNotice> : null}
        {commitment?.decision ? <StSection title="Latest business decision"><p>{commitment.decision.note}</p><StMono>{displayDate(commitment.decision.at)}</StMono></StSection> : null}
        {commitment?.result ? <StSection title="Submitted website">{safeReviewUrl ? <StTextButton href={safeReviewUrl}>Open the submitted website</StTextButton> : <StNotice tone="critical">The retained review link is not safe to open.</StNotice>}<p className="break-all"><StMono>{commitment.result.repository} at {commitment.result.commitSha}</StMono></p><p className="text-sm text-gray-muted">The operator recorded desktop, mobile, and primary-action checks. This is not proof of final-domain publication.</p></StSection> : null}
      </div>
    </div>
    {inspection.codeAgent && (inspection.permissions.canOperate || inspection.permissions.canManage) ? <CodeAgentHandoff mcpUrl={inspection.codeAgent.mcpUrl} requestId={inspection.codeAgent.requestId} /> : null}
    {actions.includes("propose") ? <form className="space-y-4" onSubmit={event => { event.preventDefault(); void submit({ kind: "propose", termsReference: terms, deliveryDefinition: definition, inputsReady: true }); }}><h2 className="text-base font-semibold">Propose the delivery</h2><TextInput label="Agreed terms reference" maxLength={500} required value={terms} disabled={disabled} onChange={event => setTerms(event.target.value)} /><TextArea label="Exact delivery definition" maxLength={1000} required value={definition} disabled={disabled} onChange={event => setDefinition(event.target.value)} /><label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={ready} disabled={disabled} onChange={event => setReady(event.target.checked)} />The required inputs are ready and I can take this delivery.</label><p className="text-sm text-gray-muted">The client must accept this exact proposal. Their acceptance starts the 24-hour clock. It does not authorize a charge or publication.</p><StPill type="submit" disabled={disabled || !ready || !terms.trim() || !definition.trim()}>Propose 24-hour delivery</StPill></form> : null}
    {actions.includes("agree") ? <section className="space-y-3"><p>Accepting the scope and terms above starts a 24-hour delivery commitment now. Review the delivery definition before continuing.</p><StHold aria-label="Accept scope and start 24-hour delivery" label="Accept scope" disabled={disabled} onAccept={() => void submit({ kind: "agree" })} /></section> : null}
    {actions.includes("submit") ? <form className="space-y-4" onSubmit={event => { event.preventDefault(); void submit({ kind: "submit", result: { websiteBindingId: bindingId, repository, commitSha, reviewUrl, desktopChecked: true, mobileChecked: true, primaryActionChecked: true } }); }}><h2 className="text-base font-semibold">Submit the built website</h2><SelectInput label="Client website" required value={bindingId} disabled={disabled} onChange={event => setBindingId(event.target.value)} options={[{value:"",label:"Choose an authorized website"},...inspection.permissions.websiteBindings.map(binding=>({value:binding.id,label:binding.name||binding.tenantId}))]} /><TextInput label="Repository, owner/name" required maxLength={201} value={repository} disabled={disabled} onChange={event => setRepository(event.target.value)} /><TextInput label="Full commit SHA" required maxLength={40} value={commitSha} disabled={disabled} onChange={event => setCommitSha(event.target.value)} /><TextInput label="Public HTTPS review URL" type="url" required maxLength={2048} value={reviewUrl} disabled={disabled} onChange={event => setReviewUrl(event.target.value)} /><p className="text-sm text-gray-muted">Do not enter credentials or preview-bypass tokens. Connecting a website does not authorize publishing it.</p>{[["Desktop checked", desktop, setDesktop], ["Mobile checked", mobile, setMobile], ["Primary action checked", primaryAction, setPrimaryAction]].map(([label, checked, setter]) => <label key={String(label)} className="flex min-h-11 items-center gap-3"><input type="checkbox" disabled={disabled} checked={Boolean(checked)} onChange={event => (setter as (value: boolean) => void)(event.target.checked)} />{String(label)}</label>)}<StPill type="submit" disabled={disabled || !bindingId || !desktop || !mobile || !primaryAction}>Submit for client review</StPill></form> : null}
    {inspection.permissions.canOperate && commitment && ["running", "changes_requested"].includes(commitment.status) && !inspection.permissions.websiteBindings.length ? <p role="status">No eligible website is connected. Bind the actual client website through the existing business settings before submitting it.</p> : null}
    {actions.some(action => ["blocker", "accept_result", "request_changes", "cancel"].includes(action)) ? <section className="space-y-4"><TextArea label="Decision or blocker note" maxLength={1000} value={note} disabled={disabled} onChange={event => setNote(event.target.value)} /><div className="flex flex-wrap gap-3">{actions.includes("blocker") ? <><StPill type="button" variant="soft" disabled={disabled || !note.trim()} onClick={() => void submit({ kind: "blocker", note })}>Record blocker</StPill>{commitment?.blocker ? <StPill type="button" variant="soft" disabled={disabled} onClick={() => void submit({ kind: "blocker", note: null })}>Clear blocker</StPill> : null}</> : null}{actions.includes("accept_result") ? <StHold aria-label="Accept delivered result" label="Accept delivered result" disabled={disabled || !note.trim()} onAccept={() => void submit({ kind: "accept_result", note })} /> : null}{actions.includes("request_changes") ? <StPill type="button" variant="soft" disabled={disabled || !note.trim()} onClick={() => void submit({ kind: "request_changes", note })}>Request changes</StPill> : null}{actions.includes("cancel") ? <StPill type="button" variant="soft" disabled={disabled || !note.trim()} onClick={() => void submit({ kind: "cancel", note })}>Cancel this delivery</StPill> : null}</div><p className="text-sm text-gray-muted">A cancellation retains records and does not delete the website, issue a refund, or change existing agreements.</p></section> : null}
    <StPill type="button" variant="soft" disabled={saving} onClick={() => void load()}>Refresh saved state</StPill>
    {children}
  </StPage>;
}
