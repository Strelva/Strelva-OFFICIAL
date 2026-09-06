"use client";

import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CircleAlert,
  Copy,
  Link2,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { AiVisibilityAssessmentForm, AiVisibilityAssessmentResult } from "@/products/ai-visibility";
import { WorkspaceLayout } from "./WorkspaceLayout";
import type {
  WorkspaceAction,
  WorkspaceHandoffPreview,
  WorkspaceSnapshot,
  WorkspaceWork,
} from "./contracts";

type View = "work" | "agency";
type Notice = { kind: "success" | "error"; message: string } | null;

interface ErrorBody {
  error?: string;
}

class WorkspaceRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function readResponse<T>(response: Response, fallback: string): Promise<T> {
  const body = (await response.json().catch(() => null)) as (T & ErrorBody) | null;
  if (!response.ok) throw new WorkspaceRequestError(body?.error || fallback, response.status);
  if (!body) throw new Error(fallback);
  return body;
}

async function postAction<T>(action: WorkspaceAction, fallback: string): Promise<T> {
  const response = await fetch("/api/workspace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action),
  });
  return readResponse<T>(response, fallback);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Saved recently";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export function WorkspaceApp() {
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(null);
  const [view, setView] = useState<View>("work");
  const [home, setHome] = useState(true);
  const [showAssessment, setShowAssessment] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);
  const [handoffPreview, setHandoffPreview] = useState<WorkspaceHandoffPreview | null>(null);
  const [handoffToken, setHandoffToken] = useState<string | null>(null);
  const [handoffLoading, setHandoffLoading] = useState(false);
  const [signInRequired, setSignInRequired] = useState(false);
  const [publicSaveResultId, setPublicSaveResultId] = useState<string | null>(null);
  const [publicSaveSaving, setPublicSaveSaving] = useState(false);
  const [publicSaveError, setPublicSaveError] = useState("");
  const requestRef = useRef(0);

  const loadWorkspace = useCallback(async (workspaceId?: string, preserveNotice = false) => {
    const request = ++requestRef.current;
    setLoading(true);
    setSignInRequired(false);
    if (!preserveNotice) setNotice(null);
    setSelectedWorkId(null);
    try {
      const suffix = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : "";
      const response = await fetch(`/api/workspace${suffix}`, { cache: "no-store" });
      const data = await readResponse<WorkspaceSnapshot>(response, "We couldn’t load this workspace.");
      if (request !== requestRef.current) return;
      setSnapshot(data);
      setSelectedWorkId(data.work[0]?.id ?? null);
      setShowAssessment(data.work.length === 0);
    } catch (cause) {
      if (request !== requestRef.current) return;
      setSnapshot(null);
      if (cause instanceof WorkspaceRequestError && cause.status === 401) setSignInRequired(true);
      setNotice({ kind: "error", message: cause instanceof Error ? cause.message : "We couldn’t load this workspace." });
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const hashToken = params.get("handoff");
    if (hashToken) {
      sessionStorage.setItem("strelva:workspace-handoff", hashToken);
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
    const token = hashToken || sessionStorage.getItem("strelva:workspace-handoff");
    if (!token) return;
    setHandoffToken(token);
    setHandoffLoading(true);
    postAction<WorkspaceHandoffPreview>({ action: "inspect_handoff", token }, "This handoff link is invalid or has expired.")
      .then(setHandoffPreview)
      .catch((cause: unknown) => {
        if (cause instanceof WorkspaceRequestError && cause.status === 401) return;
        setNotice({ kind: "error", message: cause instanceof Error ? cause.message : "This handoff link is invalid or has expired." });
        if (cause instanceof WorkspaceRequestError && (cause.status === 403 || cause.status === 404)) {
          sessionStorage.removeItem("strelva:workspace-handoff");
          setHandoffToken(null);
        }
      })
      .finally(() => setHandoffLoading(false));
  }, []);

  useEffect(() => {
    const resultId = new URLSearchParams(window.location.search).get("save");
    if (resultId && resultId.length <= 256 && /^scan_[a-z0-9]+$/i.test(resultId)) setPublicSaveResultId(resultId);
  }, []);

  const selectedWork = useMemo(
    () => snapshot?.work.find((work) => work.id === selectedWorkId) ?? snapshot?.work[0] ?? null,
    [selectedWorkId, snapshot],
  );
  const currentWorkspace = snapshot?.workspaces.find((workspace) => workspace.id === snapshot.workspaceId) ?? null;
  const delegatedRead = currentWorkspace?.access === "delegated_read";
  const signInHref = publicSaveResultId
    ? `/sign-in?next=${encodeURIComponent(`/workspace?save=${publicSaveResultId}`)}`
    : "/sign-in?next=%2Fworkspace";

  function chooseWork(id: string) {
    setHome(false);
    setSelectedWorkId(id);
    setShowAssessment(false);
    setView("work");
    setNotice(null);
  }

  function clearPublicSaveQuery() {
    const url = new URL(window.location.href);
    url.searchParams.delete("save");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  async function savePublicResult() {
    if (!publicSaveResultId || !snapshot || publicSaveSaving) return;
    setPublicSaveSaving(true);
    setPublicSaveError("");
    try {
      const body = await postAction<{ work: WorkspaceWork; alreadySaved?: boolean }>(
        { action: "save_public_result", workspaceId: snapshot.workspaceId, resultId: publicSaveResultId },
        "That public scorecard couldn’t be saved.",
      );
      setSnapshot((current) => {
        if (!current) return current;
        const work = current.work.some((item) => item.id === body.work.id)
          ? current.work.map((item) => item.id === body.work.id ? body.work : item)
          : [body.work, ...current.work];
        return { ...current, work };
      });
      setSelectedWorkId(body.work.id);
      setHome(false);
      setView("work");
      setShowAssessment(false);
      setPublicSaveResultId(null);
      clearPublicSaveQuery();
      setNotice({
        kind: "success",
        message: body.alreadySaved ? "This scorecard is already saved in your workspace." : "Public scorecard saved privately to your workspace.",
      });
    } catch (cause) {
      setPublicSaveError(cause instanceof Error ? cause.message : "That public scorecard couldn’t be saved.");
    } finally {
      setPublicSaveSaving(false);
    }
  }

  if (loading && !snapshot) return <WorkspaceLoading label="Opening your private workspace…" />;

  if (!snapshot) {
    return (
      <WorkspaceFrame>
        <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center text-center">
          {signInRequired ? <LockKeyhole className="h-7 w-7 text-accent-text" strokeWidth={1.5} /> : <CircleAlert className="h-7 w-7 text-critical" strokeWidth={1.5} />}
          <h1 className="mt-5 font-display text-[28px] font-medium text-warm-black">{signInRequired ? "Sign in to open your private work." : "Your workspace didn’t open."}</h1>
          <p role="alert" className="mt-2 text-[14px] leading-relaxed text-gray-muted">{notice?.message}</p>
          {signInRequired ? (
            <Link href={signInHref} className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-accent px-5 py-2.5 text-[13px] font-medium text-on-accent transition-colors hover:bg-accent/85">Sign in <ArrowRight className="h-4 w-4" /></Link>
          ) : <Button className="mt-6" onClick={() => void loadWorkspace()}>Try again</Button>}
        </div>
      </WorkspaceFrame>
    );
  }

  return (
    <WorkspaceFrame>
      <a href="#workspace-main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-on-accent">
        Skip to work
      </a>
      <div inert={Boolean(handoffLoading || (handoffToken && handoffPreview) || publicSaveResultId) || undefined}>
      <WorkspaceLayout key={`${snapshot.workspaceId}:${home}:${view}:${showAssessment ? "new" : selectedWork?.id}`} snapshot={snapshot} home={home} agency={view === "agency"} busy={loading} selectedWork={showAssessment ? null : selectedWork}
        managedWork={snapshot.managedWork}
        managedWorkUnavailable={snapshot.managedWorkUnavailable}
        onHome={() => { setHome(true); setView("work"); }}
        onChoose={chooseWork}
        onNew={() => { setHome(false); setView("work"); setShowAssessment(true); setNotice(null); }}
        onAgency={() => { setHome(false); setView("agency"); }}
        onWorkspace={(id) => { setHome(true); setView("work"); void loadWorkspace(id); }}
        notice={notice ? (
        <div inert={Boolean(handoffLoading || (handoffToken && handoffPreview)) || undefined} role={notice.kind === "error" ? "alert" : "status"} className={`mx-4 mt-4 flex items-start justify-between gap-4 rounded-xl border px-4 py-3 text-[13px] sm:mx-7 ${notice.kind === "error" ? "border-critical/30 bg-critical/10 text-critical" : "border-positive/30 bg-positive/10 text-positive"}`}>
          <span>{notice.message}</span>
          <button type="button" onClick={() => setNotice(null)} className="shrink-0 underline underline-offset-2">Dismiss</button>
        </div>
      ) : null}>
          {view === "agency" ? (
            <AgencySurface
              snapshot={snapshot}
              currentKind={currentWorkspace?.kind ?? "personal"}
              currentAccess={currentWorkspace?.access ?? "member"}
              selectedWork={selectedWork}
              onChanged={() => void loadWorkspace(snapshot.workspaceId, true)}
              onAgencyCreated={(workspaceId) => void loadWorkspace(workspaceId)}
              setNotice={setNotice}
            />
          ) : delegatedRead && !selectedWork ? (
            <DelegatedEmpty />
          ) : (showAssessment || !selectedWork) && !delegatedRead ? (
            <AiVisibilityAssessmentForm<WorkspaceWork>
              onSubmit={async (input) => {
                const body = await postAction<{ work: WorkspaceWork }>({ action: "assess", workspaceId: snapshot.workspaceId, ...input }, "The assessment couldn’t be completed.");
                return body.work;
              }}
              onCancel={snapshot.work.length ? () => setShowAssessment(false) : undefined}
              onCreated={(work) => {
                setSnapshot((current) => current ? { ...current, work: [work, ...current.work] } : current);
                setSelectedWorkId(work.id);
                setShowAssessment(false);
                setNotice({ kind: "success", message: "Assessment saved privately to this workspace." });
              }}
            />
          ) : selectedWork ? (
            <AiVisibilityAssessmentResult work={selectedWork} onRetry={delegatedRead ? undefined : () => setShowAssessment(true)} accessLabel={delegatedRead ? "Read-only access granted by the customer" : "Access controlled by this workspace"} />
          ) : null}
      </WorkspaceLayout>
      </div>

      {(handoffLoading || (handoffToken && handoffPreview)) ? (
        <HandoffOverlay
          loading={handoffLoading}
          token={handoffToken}
          preview={handoffPreview}
          onAccepted={(workspaceId) => {
            const url = new URL(window.location.href);
            url.hash = "";
            window.history.replaceState(null, "", `${url.pathname}${url.search}`);
            sessionStorage.removeItem("strelva:workspace-handoff");
            setHandoffToken(null);
            setHandoffPreview(null);
            void loadWorkspace(workspaceId);
          }}
          onClose={() => {
            const url = new URL(window.location.href);
            url.hash = "";
            window.history.replaceState(null, "", `${url.pathname}${url.search}`);
            sessionStorage.removeItem("strelva:workspace-handoff");
            setHandoffToken(null);
            setHandoffPreview(null);
          }}
        />
      ) : null}

      {!handoffLoading && !(handoffToken && handoffPreview) && publicSaveResultId ? (
        <PublicResultSaveOverlay
          workspaceName={currentWorkspace?.name || "Current workspace"}
          saving={publicSaveSaving}
          error={publicSaveError}
          onSave={() => void savePublicResult()}
          onClose={() => {
            if (publicSaveSaving) return;
            clearPublicSaveQuery();
            setPublicSaveResultId(null);
            setPublicSaveError("");
          }}
        />
      ) : null}
    </WorkspaceFrame>
  );
}

function WorkspaceFrame({ children }: { children: React.ReactNode }) {
  return <div data-dashboard className="flex min-h-dvh flex-col bg-surface-base text-warm-black">{children}</div>;
}

function WorkspaceLoading({ label }: { label: string }) {
  return (
    <WorkspaceFrame>
      <div role="status" className="flex min-h-dvh items-center justify-center gap-3 text-[14px] text-gray-muted">
        <Loader2 className="h-4 w-4 animate-spin" />{label}
      </div>
    </WorkspaceFrame>
  );
}

function DelegatedEmpty() {
  return (
    <div className="mx-auto max-w-2xl">
      <LockKeyhole className="h-6 w-6 text-accent-text" strokeWidth={1.5} />
      <h1 className="mt-5 font-display text-[36px] font-medium text-warm-black">Customer work shared read-only.</h1>
      <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-gray-muted">There is no work available in this shared view. Only the customer can create or change work here.</p>
    </div>
  );
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

function AgencySurface({ snapshot, currentKind, currentAccess, selectedWork, onChanged, onAgencyCreated, setNotice }: { snapshot: WorkspaceSnapshot; currentKind: "personal" | "agency" | "customer"; currentAccess: "member" | "delegated_read"; selectedWork: WorkspaceWork | null; onChanged: () => void; onAgencyCreated: (id: string) => void; setNotice: (notice: Notice) => void }) {
  if (currentAccess === "delegated_read") return <DelegatedAccessSurface />;
  if (currentKind === "personal") return <CreateAgency onCreated={onAgencyCreated} />;
  if (currentKind === "customer") return <CustomerAccess snapshot={snapshot} onChanged={onChanged} setNotice={setNotice} />;
  return <AgencyHandoff snapshot={snapshot} selectedWork={selectedWork} onChanged={onChanged} setNotice={setNotice} />;
}

function CreateAgency({ onCreated }: { onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) { setError("Enter your agency name."); return; }
    setSubmitting(true); setError("");
    try {
      const body = await postAction<{ workspaceId: string }>({ action: "create_agency", name: name.trim() }, "Your agency workspace couldn’t be created.");
      onCreated(body.workspaceId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Your agency workspace couldn’t be created."); }
    finally { setSubmitting(false); }
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

function AgencyHandoff({ snapshot, selectedWork, onChanged, setNotice }: { snapshot: WorkspaceSnapshot; selectedWork: WorkspaceWork | null; onChanged: () => void; setNotice: (notice: Notice) => void }) {
  const [recipientEmail, setRecipientEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [createdLink, setCreatedLink] = useState("");
  const isDelegatedCustomerWork = Boolean(selectedWork && snapshot.delegations.some((delegation) => delegation.workId === selectedWork.id && delegation.status === "active"));
  const isUnsupportedWork = Boolean(selectedWork && (selectedWork.productId !== "ai_visibility" || !selectedWork.payload));
  async function createHandoff(event: FormEvent) {
    event.preventDefault();
    if (!selectedWork) return;
    setSubmitting(true); setNotice(null); setCreatedLink("");
    try {
      const body = await postAction<{ token: string }>({ action: "handoff", workId: selectedWork.id, recipientEmail: recipientEmail.trim() }, "The customer handoff couldn’t be created.");
      const link = `${window.location.origin}/workspace#handoff=${encodeURIComponent(body.token)}`;
      setCreatedLink(link);
      setNotice({ kind: "success", message: `Handoff created for ${recipientEmail.trim()}. It has not been accepted yet.` });
      onChanged();
    } catch (cause) { setNotice({ kind: "error", message: cause instanceof Error ? cause.message : "The customer handoff couldn’t be created." }); }
    finally { setSubmitting(false); }
  }
  async function revoke(id: string) {
    setSubmitting(true); setNotice(null);
    try { await postAction<{ ok: true }>({ action: "revoke_handoff", handoffId: id }, "The handoff couldn’t be revoked."); setNotice({ kind: "success", message: "The pending handoff was revoked." }); onChanged(); }
    catch (cause) { setNotice({ kind: "error", message: cause instanceof Error ? cause.message : "The handoff couldn’t be revoked." }); }
    finally { setSubmitting(false); }
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
          {createdLink ? <div className="mt-4 flex flex-col gap-2 rounded-xl bg-gray-bg px-4 py-3 sm:flex-row sm:items-center"><code className="min-w-0 flex-1 truncate text-[11px] text-gray-muted">{createdLink}</code><Button type="button" size="sm" variant="secondary" icon={<Copy className="h-3.5 w-3.5" />} onClick={() => void navigator.clipboard.writeText(createdLink)}>Copy link</Button></div> : null}
        </form>
      ) : <p className="mt-8 border-y border-gray-border py-6 text-[14px] text-gray-muted">{isDelegatedCustomerWork ? "This is a customer-owned copy shared with your agency as read-only. It cannot be handed to someone else." : isUnsupportedWork ? "This product cannot be handed off in this release. Its saved record remains available." : "Create or select an assessment before preparing a handoff."}</p>}
      <section className="mt-8"><h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-muted">Handoff history</h2>{snapshot.handoffs.length ? <ul className="mt-3 divide-y divide-gray-border border-y border-gray-border">{snapshot.handoffs.map((handoff) => <li key={handoff.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[13px] font-medium text-warm-black">{handoff.recipientEmail}</p><p className="mt-1 text-[11px] capitalize text-gray-muted">{handoff.status} · created {formatDate(handoff.createdAt)}</p></div>{handoff.status === "pending" ? <Button type="button" size="sm" variant="danger" disabled={submitting} onClick={() => void revoke(handoff.id)}>Revoke</Button> : null}</li>)}</ul> : <p className="mt-3 text-[13px] text-gray-muted">No handoffs from this workspace yet.</p>}</section>
    </div>
  );
}

function CustomerAccess({ snapshot, onChanged, setNotice }: { snapshot: WorkspaceSnapshot; onChanged: () => void; setNotice: (notice: Notice) => void }) {
  const [submitting, setSubmitting] = useState(false);
  async function revoke(id: string) {
    setSubmitting(true); setNotice(null);
    try { await postAction<{ ok: true }>({ action: "revoke_delegation", delegationId: id }, "Agency access couldn’t be revoked."); setNotice({ kind: "success", message: "Agency access was revoked. Your work remains here." }); onChanged(); }
    catch (cause) { setNotice({ kind: "error", message: cause instanceof Error ? cause.message : "Agency access couldn’t be revoked." }); }
    finally { setSubmitting(false); }
  }
  return (
    <div className="mx-auto max-w-3xl">
      <ShieldCheck className="h-6 w-6 text-accent-text" strokeWidth={1.5} />
      <h1 className="mt-5 font-display text-[36px] font-medium text-warm-black">You own this workspace.</h1>
      <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-gray-muted">Agency access is read-only and can be removed without deleting the work handed to you.</p>
      <section className="mt-8"><h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-muted">Agency access</h2>{snapshot.delegations.length ? <ul className="mt-3 divide-y divide-gray-border border-y border-gray-border">{snapshot.delegations.map((delegation) => <li key={delegation.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[13px] font-medium text-warm-black">Read-only access</p><p className="mt-1 text-[11px] text-gray-muted">{delegation.status === "active" ? "Active" : "Revoked"}</p></div>{delegation.status === "active" && delegation.canRevoke ? <Button size="sm" variant="danger" disabled={submitting} onClick={() => void revoke(delegation.id)}>Revoke access</Button> : null}</li>)}</ul> : <p className="mt-3 text-[13px] text-gray-muted">No agency can access this workspace.</p>}</section>
    </div>
  );
}

function HandoffOverlay({ loading, token, preview, onAccepted, onClose }: { loading: boolean; token: string | null; preview: WorkspaceHandoffPreview | null; onAccepted: (workspaceId: string) => void; onClose: () => void }) {
  const checkboxId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [allowAgencyAccess, setAllowAgencyAccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
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
    if (!focusable.length) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  async function accept() {
    if (!token) return;
    setSubmitting(true); setError("");
    try { const body = await postAction<{ workspaceId: string; workId: string }>({ action: "accept_handoff", token, allowAgencyAccess }, "This handoff couldn’t be accepted."); onAccepted(body.workspaceId); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "This handoff couldn’t be accepted."); }
    finally { setSubmitting(false); }
  }
  return (
    <div ref={dialogRef} tabIndex={-1} onKeyDown={handleDialogKeyDown} role="dialog" aria-modal="true" aria-labelledby={!loading && preview ? "handoff-title" : undefined} aria-label={loading || !preview ? "Opening private handoff" : undefined} className="fixed inset-0 z-50 overflow-y-auto bg-overlay-scrim p-3 outline-none sm:p-8">
      <div className="mx-auto min-h-full max-w-3xl rounded-2xl border border-gray-border bg-surface p-5 shadow-2xl sm:p-9">
        {loading || !preview ? <div role="status" className="flex min-h-[60vh] items-center justify-center gap-3 text-[14px] text-gray-muted"><Loader2 className="h-4 w-4 animate-spin" />Opening private handoff…</div> : (
          <>
            <button type="button" autoFocus onClick={onClose} className="inline-flex items-center gap-1.5 text-[12px] text-gray-muted hover:text-warm-black"><ArrowLeft className="h-3.5 w-3.5" />Back to workspace</button>
            <div className="mt-8 flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-dim text-accent-text"><UserRound className="h-4.5 w-4.5" /></div><div><p className="text-[11px] uppercase tracking-[0.14em] text-gray-muted">Prepared for {preview.recipientEmail}</p><h1 id="handoff-title" className="mt-2 font-display text-[32px] font-medium leading-tight text-warm-black">{preview.agencyName} prepared this for you.</h1></div></div>
            <div className="mt-8 border-y border-gray-border py-7"><AiVisibilityAssessmentResult work={preview.work} accessLabel="Prepared handoff preview" /></div>
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

function PublicResultSaveOverlay({ workspaceName, saving, error, onSave, onClose }: { workspaceName: string; saving: boolean; error: string; onSave: () => void; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
    if (!dialogRef.current?.contains(document.activeElement)) dialogRef.current?.focus();
    return () => previousFocusRef.current?.focus();
  }, []);

  useEffect(() => {
    if (saving && !dialogRef.current?.querySelector("button:not([disabled])")) dialogRef.current?.focus();
  }, [saving]);

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!saving) onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])") ?? []);
    if (!focusable.length) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

  return (
    <div ref={dialogRef} tabIndex={-1} onKeyDown={handleDialogKeyDown} role="dialog" aria-modal="true" aria-labelledby="public-save-title" className="fixed inset-0 z-50 overflow-y-auto bg-overlay-scrim p-3 outline-none sm:p-8">
      <div className="mx-auto flex min-h-full max-w-xl items-center">
        <div className="w-full rounded-2xl border border-gray-border bg-surface p-5 shadow-2xl sm:p-8">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent-text">Private workspace</p>
          <h1 id="public-save-title" className="mt-3 font-display text-[28px] font-medium leading-tight text-warm-black">Save a private copy of this public scorecard?</h1>
          <p className="mt-5 rounded-xl border border-gray-border bg-surface-inset px-4 py-3 text-[13px] text-gray-fg"><span className="font-medium text-warm-black">Workspace:</span> {workspaceName}</p>
          <p className="mt-5 text-[14px] leading-relaxed text-gray-muted">This creates a new private work item in this workspace. The public scorecard stays separate and its source ownership does not change.</p>
          {error ? <p role="alert" className="mt-4 rounded-lg border border-critical/30 bg-critical/10 px-3 py-2 text-[13px] leading-relaxed text-critical">{error}</p> : null}
          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" size="lg" disabled={saving} onClick={onClose}>Back</Button>
            <Button type="button" size="lg" loading={saving} onClick={onSave} icon={<ArrowRight className="h-4 w-4" />}>Save a copy</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
