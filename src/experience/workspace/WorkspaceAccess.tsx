"use client";

import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Copy,
  Link2,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { AiVisibilityAssessmentResult } from "@/products/ai-visibility";
import { TrackerHandoffPreview } from "./TrackerHandoffPreview";
import type {
  WorkspaceAction,
  WorkspaceHandoffPreview,
  WorkspaceSnapshot,
  WorkspaceWork,
} from "@/experience/workspace/contracts";

export type AccessNotice = { kind: "success" | "error"; message: string } | null;
export type AccessActionPoster = <T>(action: WorkspaceAction, fallback: string) => Promise<T>;

type WorkspaceRole = "owner" | "admin" | "member";

interface AccessPanelProps {
  snapshot: WorkspaceSnapshot;
  currentKind: "personal" | "agency" | "customer";
  currentAccess: "member" | "delegated_read";
  currentRole?: WorkspaceRole;
  selectedWork: WorkspaceWork | null;
  postAction: AccessActionPoster;
  onChanged: () => void;
  onAgencyCreated: (id: string) => void;
  setNotice: (notice: AccessNotice) => void;
}

/**
 * Contextual access orchestration for the workspace. It owns the handoff and
 * revoke interactions, while the workspace route remains the authorization
 * boundary and the platform owns membership/delegation transitions.
 */
export function AccessPanel({ snapshot, currentKind, currentAccess, currentRole, selectedWork, postAction, onChanged, onAgencyCreated, setNotice }: AccessPanelProps) {
  const contextKey = [snapshot.workspaceId, currentKind, currentAccess, currentRole || "", selectedWork?.id || ""].join(":");
  const isActive = useActiveContext(contextKey);
  // Local handoff/revoke state belongs to the exact workspace + selected work.
  // Remounting on that boundary prevents a created token or a pending spinner
  // from leaking into another work item while an old request resolves.
  if (currentAccess === "delegated_read") return <DelegatedAccessSurface key={contextKey} />;
  if (currentKind === "personal") return <CreateAgency key={contextKey} postAction={postAction} isActive={isActive} onCreated={onAgencyCreated} />;
  if (currentKind === "customer") return <CustomerAccess key={contextKey} snapshot={snapshot} currentRole={currentRole} postAction={postAction} isActive={isActive} onChanged={onChanged} setNotice={setNotice} />;
  return <AgencyHandoff key={contextKey} snapshot={snapshot} selectedWork={selectedWork} postAction={postAction} isActive={isActive} onChanged={onChanged} setNotice={setNotice} />;
}

function useActiveContext(contextKey: string) {
  const mountedRef = useRef(false);
  const contextRef = useRef(contextKey);
  // Invalidate stale closures at commit, before the browser can resume an
  // asynchronous response, without mutating refs during an abandoned render.
  useLayoutEffect(() => {
    contextRef.current = contextKey;
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, [contextKey]);
  return () => mountedRef.current && contextRef.current === contextKey;
}

function DelegatedAccessSurface() {
  return (
    <div className="mx-auto max-w-3xl">
      <LockKeyhole className="h-6 w-6 text-accent-text" strokeWidth={1.5} />
      <h1 className="mt-5 font-display text-[36px] font-medium text-warm-black">Customer work shared read-only.</h1>
      <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-gray-muted">Your agency can review the work the customer shared. The customer owns it and controls access. You cannot create, change, hand off, or revoke anything from this view.</p>
    </div>
  );
}

function CreateAgency({ postAction, isActive, onCreated }: { postAction: AccessActionPoster; isActive: () => boolean; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) { setError("Enter your agency name."); return; }
    setSubmitting(true); setError("");
    try {
      const body = await postAction<{ workspaceId: string }>({ action: "create_agency", name: name.trim() }, "Your agency workspace couldn’t be created.");
      if (isActive()) onCreated(body.workspaceId);
    } catch (cause) { if (isActive()) setError(cause instanceof Error ? cause.message : "Your agency workspace couldn’t be created."); }
    finally { if (isActive()) setSubmitting(false); }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Building2 className="h-6 w-6 text-accent-text" strokeWidth={1.5} />
      <h1 className="mt-5 font-display text-[36px] font-medium leading-tight text-warm-black">Prepare useful work before the customer arrives.</h1>
      <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-gray-muted">An agency workspace keeps your drafts separate. Hand off a finished assessment to its named customer, who receives their own copy and decides whether you retain read-only access.</p>
      <form onSubmit={submit} className="mt-8 max-w-md">
        <TextInput label="Agency name" autoFocus required value={name} onChange={(event) => setName(event.target.value)} placeholder="Northstar Agency" className="min-h-12" />
        {error ? <p role="alert" className="mt-3 text-[13px] text-critical">{error}</p> : null}
        <Button type="submit" size="lg" loading={submitting} className="mt-5">Create agency workspace</Button>
      </form>
    </div>
  );
}

function AgencyHandoff({ snapshot, selectedWork, postAction, isActive, onChanged, setNotice }: { snapshot: WorkspaceSnapshot; selectedWork: WorkspaceWork | null; postAction: AccessActionPoster; isActive: () => boolean; onChanged: () => void; setNotice: (notice: AccessNotice) => void }) {
  const [recipientEmail, setRecipientEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [createdLink, setCreatedLink] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const isDelegatedCustomerWork = Boolean(selectedWork && snapshot.delegations.some((delegation) => delegation.workId === selectedWork.id && delegation.status === "active"));
  const handoffAction = selectedWork?.assessment?.actions.handoff;
  const trackerHandoffAllowed = selectedWork?.productId === "tracker" && selectedWork.resourceKind === "tracker";
  const isUnsupportedWork = Boolean(selectedWork && !handoffAction?.allowed && !trackerHandoffAllowed);

  async function createHandoff(event: FormEvent) {
    event.preventDefault();
    if (!selectedWork) return;
    setSubmitting(true); setNotice(null); setCreatedLink(""); setCopyState("idle");
    try {
      const body = await postAction<{ token: string }>({ action: "handoff", workId: selectedWork.id, recipientEmail: recipientEmail.trim() }, "The customer handoff couldn’t be created.");
      const link = `${window.location.origin}/workspace#handoff=${encodeURIComponent(body.token)}`;
      if (!isActive()) return;
      setCreatedLink(link);
      setNotice({ kind: "success", message: `Handoff created for ${recipientEmail.trim()}. It has not been accepted yet.` });
      onChanged();
    } catch (cause) { if (isActive()) setNotice({ kind: "error", message: cause instanceof Error ? cause.message : "The customer handoff couldn’t be created." }); }
    finally { if (isActive()) setSubmitting(false); }
  }

  async function revoke(id: string) {
    setSubmitting(true); setNotice(null);
    try { await postAction<{ ok: true }>({ action: "revoke_handoff", handoffId: id }, "The handoff couldn’t be revoked."); if (!isActive()) return; setNotice({ kind: "success", message: "The pending handoff was revoked." }); onChanged(); }
    catch (cause) { if (isActive()) setNotice({ kind: "error", message: cause instanceof Error ? cause.message : "The handoff couldn’t be revoked." }); }
    finally { if (isActive()) setSubmitting(false); }
  }

  async function copyLink() {
    if (!createdLink) return;
    try { await navigator.clipboard.writeText(createdLink); if (isActive()) setCopyState("copied"); }
    catch { if (isActive()) setCopyState("error"); }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-accent-text">Agency handoff</p>
      <h1 className="mt-4 font-display text-[36px] font-medium leading-tight text-warm-black">Put finished work in the customer’s hands.</h1>
      <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-gray-muted">The link is bound to the recipient’s signed-in email. Acceptance creates an independent, customer-owned copy. Agency access is never assumed.</p>
      {selectedWork && !isDelegatedCustomerWork && !isUnsupportedWork ? (
        <form onSubmit={createHandoff} className="mt-8 border-y border-gray-border py-6">
          <p className="text-[12px] text-gray-muted">Handoff</p><p className="mt-1 text-[15px] font-medium text-warm-black">{selectedWork.title}</p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"><TextInput label="Customer email" type="email" autoComplete="email" required value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} placeholder="owner@business.com" className="min-h-11 sm:min-w-[300px]" /><Button type="submit" size="lg" loading={submitting} icon={<Link2 className="h-4 w-4" />}>Create private handoff</Button></div>
          {createdLink ? <div className="mt-4 flex flex-col gap-2 rounded-xl bg-gray-bg px-4 py-3 sm:flex-row sm:items-center"><code className="min-w-0 flex-1 truncate text-[11px] text-gray-muted">{createdLink}</code><Button type="button" size="sm" variant="secondary" icon={<Copy className="h-3.5 w-3.5" />} onClick={() => void copyLink()}>Copy link</Button>{copyState === "copied" ? <span role="status" className="text-[11px] text-positive">Copied</span> : copyState === "error" ? <span role="status" className="text-[11px] text-critical">Copy unavailable</span> : null}</div> : null}
        </form>
      ) : <p className="mt-8 border-y border-gray-border py-6 text-[14px] text-gray-muted">{isDelegatedCustomerWork ? "This is a customer-owned copy shared with your agency as read-only. It cannot be handed to someone else." : isUnsupportedWork ? "This product cannot be handed off in this release. Its saved record remains available." : "Create or select an assessment before preparing a handoff."}</p>}
      <section className="mt-8"><h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-muted">Handoff history</h2>{snapshot.handoffs.length ? <ul className="mt-3 divide-y divide-gray-border border-y border-gray-border">{snapshot.handoffs.map((handoff) => <li key={handoff.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[13px] font-medium text-warm-black">{handoff.recipientEmail}</p><p className="mt-1 text-[11px] capitalize text-gray-muted">{handoff.status} · created {formatDate(handoff.createdAt)}</p></div>{handoff.status === "pending" ? <Button type="button" size="sm" variant="danger" disabled={submitting} onClick={() => void revoke(handoff.id)}>Revoke</Button> : null}</li>)}</ul> : <p className="mt-3 text-[13px] text-gray-muted">No handoffs from this workspace yet.</p>}</section>
    </div>
  );
}

function CustomerAccess({ snapshot, currentRole, postAction, isActive, onChanged, setNotice }: { snapshot: WorkspaceSnapshot; currentRole?: WorkspaceRole; postAction: AccessActionPoster; isActive: () => boolean; onChanged: () => void; setNotice: (notice: AccessNotice) => void }) {
  const [submitting, setSubmitting] = useState(false);

  async function revoke(id: string) {
    setSubmitting(true); setNotice(null);
    try { await postAction<{ ok: true }>({ action: "revoke_delegation", delegationId: id }, "Agency access couldn’t be revoked."); if (!isActive()) return; setNotice({ kind: "success", message: "Agency access was revoked. Your work remains here." }); onChanged(); }
    catch (cause) { if (isActive()) setNotice({ kind: "error", message: cause instanceof Error ? cause.message : "Agency access couldn’t be revoked." }); }
    finally { if (isActive()) setSubmitting(false); }
  }

  const heading = currentRole === "owner" ? "You own this workspace." : currentRole === "admin" ? "You manage access for this workspace." : "Your workspace access.";
  const description = currentRole === "owner" || currentRole === "admin"
    ? "Agency access is read-only and can be removed without deleting the work handed to you."
    : "Agency access is read-only. The workspace owner controls membership and may revoke it.";

  return (
    <div className="mx-auto max-w-3xl">
      <ShieldCheck className="h-6 w-6 text-accent-text" strokeWidth={1.5} />
      <h1 className="mt-5 font-display text-[36px] font-medium text-warm-black">{heading}</h1>
      <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-gray-muted">{description}</p>
      <section className="mt-8"><h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-muted">Agency access</h2>{snapshot.delegations.length ? <ul className="mt-3 divide-y divide-gray-border border-y border-gray-border">{snapshot.delegations.map((delegation) => <li key={delegation.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[13px] font-medium text-warm-black">Read-only access</p><p className="mt-1 text-[11px] text-gray-muted">{delegation.status === "active" ? "Active" : "Revoked"}</p></div>{delegation.status === "active" && delegation.canRevoke ? <Button size="sm" variant="danger" disabled={submitting} onClick={() => void revoke(delegation.id)}>Revoke access</Button> : null}</li>)}</ul> : <p className="mt-3 text-[13px] text-gray-muted">No agency can access this workspace.</p>}</section>
    </div>
  );
}

export interface AccessHandoffOverlayProps {
  loading: boolean;
  token: string | null;
  preview: WorkspaceHandoffPreview | null;
  postAction: AccessActionPoster;
  onAccepted: (workspaceId: string, workId: string) => void;
  onClose: () => void;
}

export function AccessHandoffOverlay({ loading, token, preview, postAction, onAccepted, onClose }: AccessHandoffOverlayProps) {
  const checkboxId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [allowAgencyAccess, setAllowAgencyAccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const isActive = useActiveContext(`${token || ""}:${preview?.work.id || ""}`);

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    return () => previousFocusRef.current?.focus();
  }, []);
  useEffect(() => {
    if (!loading && preview) dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [loading, preview]);

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!submitting) onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])") ?? []);
    if (!focusable.length) { event.preventDefault(); dialogRef.current?.focus(); return; }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

  async function accept() {
    if (!token) return;
    setSubmitting(true); setError("");
    try {
      const body = await postAction<{ workspaceId: string; workId: string }>({ action: "accept_handoff", token, allowAgencyAccess }, "This handoff couldn’t be accepted.");
      if (isActive()) onAccepted(body.workspaceId, body.workId);
    } catch (cause) { if (isActive()) setError(cause instanceof Error ? cause.message : "This handoff couldn’t be accepted."); }
    finally { if (isActive()) setSubmitting(false); }
  }

  const isAiVisibilityPreview = preview?.work.assessment?.kind === "ai_visibility";
  const isTrackerPreview = preview?.work.productId === "tracker" && preview.work.tracker;
  return (
    <div ref={dialogRef} tabIndex={-1} onKeyDown={handleDialogKeyDown} role="dialog" aria-modal="true" aria-labelledby={!loading && preview ? "handoff-title" : undefined} aria-label={loading || !preview ? "Opening private handoff" : undefined} className="fixed inset-0 z-50 overflow-y-auto bg-overlay-scrim p-3 outline-none sm:p-8">
      <div className="mx-auto min-h-full max-w-3xl rounded-2xl border border-gray-border bg-surface p-5 shadow-2xl sm:p-9">
        {loading || !preview ? <div role="status" className="flex min-h-[60vh] items-center justify-center gap-3 text-[14px] text-gray-muted"><Loader2 className="h-4 w-4 animate-spin" />Opening private handoff…</div> : (
          <>
            <button type="button" autoFocus onClick={onClose} className="inline-flex items-center gap-1.5 text-[12px] text-gray-muted hover:text-warm-black"><ArrowLeft className="h-3.5 w-3.5" />Back to workspace</button>
            <div className="mt-8 flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-dim text-accent-text"><UserRound className="h-4.5 w-4.5" /></div><div><p className="text-[11px] uppercase tracking-[0.14em] text-gray-muted">Prepared for {preview.recipientEmail}</p><h1 id="handoff-title" className="mt-2 font-display text-[32px] font-medium leading-tight text-warm-black">{preview.agencyName} prepared this for you.</h1></div></div>
            <div className="mt-8 border-y border-gray-border py-7">{isAiVisibilityPreview ? <AiVisibilityAssessmentResult work={preview.work} accessLabel="Prepared handoff preview" /> : isTrackerPreview ? <TrackerHandoffPreview preview={isTrackerPreview} /> : <p className="text-[14px] text-gray-muted">This handoff preview is unavailable. The saved work remains unchanged.</p>}</div>
            {preview.accepted ? <p className="mt-7 flex items-center gap-2 text-[14px] text-positive"><Check className="h-4 w-4" />This handoff has already been accepted.</p> : (
              <div className="mt-7">
                <p className="text-[14px] font-medium text-warm-black">Accept your own copy</p><p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-gray-muted">This creates customer-owned work in your account. The agency’s original remains separate.</p>
                <label htmlFor={checkboxId} className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-gray-border bg-surface-inset p-4"><input id={checkboxId} type="checkbox" checked={allowAgencyAccess} onChange={(event) => setAllowAgencyAccess(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" /><span><span className="block text-[13px] font-medium text-warm-black">Allow {preview.agencyName} read-only access</span><span className="mt-1 block text-[12px] leading-relaxed text-gray-muted">Optional and unchecked by default. You can revoke access later without losing your copy.</span></span></label>
                {error ? <p role="alert" className="mt-4 text-[13px] text-critical">{error}</p> : null}
                <Button size="lg" className="mt-5" loading={submitting} onClick={() => void accept()} icon={<ArrowRight className="h-4 w-4" />}>Accept into my workspace</Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Saved recently";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}
