"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextInput, TextArea, SelectInput } from "@/components/ui/TextInput";
import { deliveryCommitmentStatus, deliveryCommitmentCommandSchema, deliveryReviewUrlSchema } from "@/platform/service-requests/delivery-commitment";
import { serviceRequestSchema } from "@/platform/service-requests/types";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";
import { deliveryActions, deliveryCommandKey, deliveryInspectionSchema, retainedDeliveryCommand, type DeliveryChange, type DeliveryCommand, type DeliveryInspection } from "./delivery-client";

function errorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const error = (body as { error?: { message?: unknown } }).error;
  return typeof error?.message === "string" ? error.message : fallback;
}
function displayDate(value: string | null): string {
  return value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "Not started";
}

/** Uses the existing delivery API. Browser affordances never grant authority. */
export function DeliveryCommitmentPanel({ requestId }: { requestId: string }) {
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
      setNotice("Saved. Publication, billing, and provider access are unchanged.");
      await load();
    } catch (cause) {
      if (version === generation.current) setError(cause instanceof Error ? cause.message : "The outcome is uncertain. Retry the retained command.");
    } finally { mutation.current = false; if (version === generation.current || version + 1 === generation.current) setSaving(false); }
  }

  if (loading) return <p role="status">Loading the saved delivery and current permissions…</p>;
  if (!inspection || inspection.request.id !== requestId) return <section className="space-y-4"><p role="alert">{error || "This delivery is unavailable."}</p>{signIn ? <Link href={`/sign-in?next=${encodeURIComponent(`/workspace/delivery/${requestId}`)}`}>Sign in to review this delivery</Link> : <Button type="button" variant="secondary" onClick={() => void load()}>Check again</Button>}</section>;
  const item = inspection.request;
  const commitment = item.deliveryCommitment;
  const actions = deliveryActions(inspection);
  const disabled = saving || Boolean(pending);
  const safeReviewUrl = commitment?.result && deliveryReviewUrlSchema.safeParse(commitment.result.reviewUrl).success ? commitment.result.reviewUrl : null;
  return <section className="space-y-6" aria-labelledby="delivery-title">
    <header className="space-y-3"><Link href={`/workspace?workspaceId=${encodeURIComponent(item.businessId)}`}>Back to this business</Link><h1 id="delivery-title" className="font-display text-3xl">{item.outcome}</h1><p className="text-gray-muted">{commitment ? deliveryCommitmentStatus(commitment) : item.providerAcceptance.status === "accepted" ? "Accepted for review. Delivery has not started." : "Waiting for provider review. No delivery commitment has been accepted."}</p></header>
    <p>{item.request}</p>
    <p className="text-sm text-gray-muted">Scope: {item.scope.join(", ")} · Request revision {item.revision}</p>
    {error ? <p role="alert">{error}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {pending ? <aside className="space-y-3 rounded-xl border border-gray-border p-4"><p>A previous command is not confirmed. Retry that exact command before making another change.</p><Button type="button" disabled={saving} onClick={() => void submit()}>Retry retained command</Button></aside> : null}
    {inspection.permissions.stopped ? <p role="status">New work is stopped for this business. Records remain available; only an eligible cancellation can be recorded.</p> : null}
    {commitment ? <dl className="grid gap-4 rounded-3xl border border-gray-border p-6"><div><dt>Agreed terms reference</dt><dd>{commitment.termsReference}</dd></div><div><dt>What will be delivered</dt><dd>{commitment.deliveryDefinition}</dd></div><div><dt>Named operator</dt><dd>{commitment.operatorId}</dd></div><div><dt>Started</dt><dd>{displayDate(commitment.startedAt)}</dd></div><div><dt>Original deadline</dt><dd>{displayDate(commitment.dueAt)}</dd></div>{commitment.blocker ? <div><dt>Blocked by</dt><dd>{commitment.blocker.note}. The original deadline is unchanged.</dd></div> : null}{commitment.decision ? <div><dt>Latest customer decision</dt><dd>{commitment.decision.note}</dd></div> : null}</dl> : null}
    {commitment?.result ? <section className="space-y-3"><h2 className="text-xl">Submitted website</h2>{safeReviewUrl ? <a href={safeReviewUrl} target="_blank" rel="noreferrer noopener">Open the submitted website</a> : <p>The retained review link is not safe to open.</p>}<p className="break-all text-sm">{commitment.result.repository} at {commitment.result.commitSha}</p><p className="text-sm text-gray-muted">The operator recorded desktop, mobile, and primary-action checks. This is not proof of final-domain publication.</p></section> : null}
    {actions.includes("propose") ? <form className="space-y-4" onSubmit={event => { event.preventDefault(); void submit({ kind: "propose", termsReference: terms, deliveryDefinition: definition, inputsReady: true }); }}><h2 className="text-xl">Propose the delivery</h2><TextInput label="Agreed terms reference" maxLength={500} required value={terms} disabled={disabled} onChange={event => setTerms(event.target.value)} /><TextArea label="Exact delivery definition" maxLength={1000} required value={definition} disabled={disabled} onChange={event => setDefinition(event.target.value)} /><label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={ready} disabled={disabled} onChange={event => setReady(event.target.checked)} />The required inputs are ready and I can take this delivery.</label><p className="text-sm text-gray-muted">The customer must accept this exact proposal. Their acceptance starts the 24-hour clock. It does not authorize a charge or publication.</p><Button type="submit" disabled={disabled || !ready || !terms.trim() || !definition.trim()}>Propose 24-hour delivery</Button></form> : null}
    {actions.includes("agree") ? <section className="space-y-3"><p>Accepting the scope and terms above starts a 24-hour delivery commitment now. Review the delivery definition before continuing.</p><Button type="button" disabled={disabled} onClick={() => void submit({ kind: "agree" })}>Accept scope and start 24-hour delivery</Button></section> : null}
    {actions.includes("submit") ? <form className="space-y-4" onSubmit={event => { event.preventDefault(); void submit({ kind: "submit", result: { websiteBindingId: bindingId, repository, commitSha, reviewUrl, desktopChecked: true, mobileChecked: true, primaryActionChecked: true } }); }}><h2 className="text-xl">Submit the built website</h2><SelectInput label="Customer website" required value={bindingId} disabled={disabled} onChange={event => setBindingId(event.target.value)} options={[{value:"",label:"Choose an authorized website"},...inspection.permissions.websiteBindings.map(binding=>({value:binding.id,label:binding.name||binding.tenantId}))]} /><TextInput label="Repository, owner/name" required maxLength={201} value={repository} disabled={disabled} onChange={event => setRepository(event.target.value)} /><TextInput label="Full commit SHA" required maxLength={40} value={commitSha} disabled={disabled} onChange={event => setCommitSha(event.target.value)} /><TextInput label="Public HTTPS review URL" type="url" required maxLength={2048} value={reviewUrl} disabled={disabled} onChange={event => setReviewUrl(event.target.value)} /><p className="text-sm text-gray-muted">Do not enter credentials or preview-bypass tokens. Connecting a website does not authorize publishing it.</p>{[["Desktop checked", desktop, setDesktop], ["Mobile checked", mobile, setMobile], ["Primary action checked", primaryAction, setPrimaryAction]].map(([label, checked, setter]) => <label key={String(label)} className="flex min-h-11 items-center gap-3"><input type="checkbox" disabled={disabled} checked={Boolean(checked)} onChange={event => (setter as (value: boolean) => void)(event.target.checked)} />{String(label)}</label>)}<Button type="submit" disabled={disabled || !bindingId || !desktop || !mobile || !primaryAction}>Submit for customer review</Button></form> : null}
    {inspection.permissions.canOperate && commitment && ["running", "changes_requested"].includes(commitment.status) && !inspection.permissions.websiteBindings.length ? <p role="status">No eligible website is connected. Bind the actual customer website through the existing business settings before submitting it.</p> : null}
    {actions.some(action => ["blocker", "accept_result", "request_changes", "cancel"].includes(action)) ? <section className="space-y-4"><TextArea label="Decision or blocker note" maxLength={1000} value={note} disabled={disabled} onChange={event => setNote(event.target.value)} /><div className="flex flex-wrap gap-3">{actions.includes("blocker") ? <><Button type="button" disabled={disabled || !note.trim()} onClick={() => void submit({ kind: "blocker", note })}>Record blocker</Button>{commitment?.blocker ? <Button type="button" variant="secondary" disabled={disabled} onClick={() => void submit({ kind: "blocker", note: null })}>Clear blocker</Button> : null}</> : null}{actions.includes("accept_result") ? <Button type="button" disabled={disabled || !note.trim()} onClick={() => void submit({ kind: "accept_result", note })}>Accept delivered result</Button> : null}{actions.includes("request_changes") ? <Button type="button" variant="secondary" disabled={disabled || !note.trim()} onClick={() => void submit({ kind: "request_changes", note })}>Request changes</Button> : null}{actions.includes("cancel") ? <Button type="button" variant="danger" disabled={disabled || !note.trim()} onClick={() => void submit({ kind: "cancel", note })}>Cancel this delivery</Button> : null}</div><p className="text-sm text-gray-muted">A cancellation retains records and does not delete the website, issue a refund, or change existing agreements.</p></section> : null}
    <Button type="button" variant="secondary" disabled={saving} onClick={() => void load()}>Refresh saved state</Button>
  </section>;
}
