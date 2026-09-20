"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import type { WorkspaceWork } from "@/experience/workspace/contracts";
import { WorkBudgetPanel } from "@/experience/workspace/WorkBudgetPanel";
import { responsibilitySchema, type Responsibility } from "@/platform/work-execution/engine";
import { operationalAssignmentSchema, type OperationalAssignment } from "@/platform/work-participation/assignments";
type Props = { workspaceId: string; workId?: string; standingId?: string; assignmentId?: string; sources: WorkspaceWork[]; readOnly?: boolean; newWorkBlocked?: boolean; initialRequest?: string; onSaved(id: string): void };
type Saved = { id: string; workspaceId: string; payload: Responsibility };
const NEW_WORK_PAUSED_COPY = "New work is paused for this workspace. Existing work remains available to review and reconcile.";
const label: Record<Responsibility["status"], string> = { proposed: "Ready for your review", ready: "Ready to continue", running: "Work in progress", waiting: "Waiting for the next check", paused: "Paused", needs_attention: "Needs your decision", completed: "Completed", cancelled: "Cancelled" };
export function ResponsibilityExperience(props: Props) {
  if (props.assignmentId) return <AssignedResponsibilityExperience {...props} assignmentId={props.assignmentId} />;
  if (props.standingId) return <StandingResponsibilityExperience {...props} standingId={props.standingId} />;
  return <FiniteResponsibilityExperience {...props} />;
}

type AssignedView = { assignment: OperationalAssignment; responsibility: Saved };

function effectiveAssignmentStatus(assignment: OperationalAssignment): OperationalAssignment["status"] {
  return assignment.status === "offered" || assignment.status === "accepted"
    ? new Date(assignment.expiresAt).getTime() <= Date.now() ? "expired" : assignment.status
    : assignment.status;
}

function assignmentKind(kind: OperationalAssignment["assigneeKind"]): string {
  return kind === "agency" ? "Agency" : kind === "staff" ? "Staff" : kind === "strelva" ? "Strelva" : "Agent";
}

function assignmentLink(workspaceId: string, assignmentId: string): string {
  return `/workspace?workspaceId=${encodeURIComponent(workspaceId)}&view=operations&assignmentId=${encodeURIComponent(assignmentId)}`;
}

function parseAssignedView(value: unknown, workspaceId: string): AssignedView {
  if (!value || typeof value !== "object") throw new Error("The assigned job response is invalid.");
  const raw = value as { assignment?: unknown; responsibility?: { id?: unknown; workspaceId?: unknown; payload?: unknown } };
  const assignment = operationalAssignmentSchema.parse(raw.assignment);
  const responsibility = {
    id: String(raw.responsibility?.id || ""),
    workspaceId: String(raw.responsibility?.workspaceId || ""),
    payload: responsibilitySchema.parse(raw.responsibility?.payload),
  };
  if (assignment.workspaceId !== workspaceId || responsibility.workspaceId !== workspaceId || responsibility.id !== assignment.workId) {
    throw new Error("This assignment belongs to a different workspace.");
  }
  return { assignment, responsibility };
}

function AssignedResponsibilityExperience({ workspaceId, assignmentId, readOnly, newWorkBlocked }: Props & { assignmentId: string }) {
  const [view, setView] = useState<AssignedView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setError("");
    fetch(`/api/operational-assignments?assignmentId=${encodeURIComponent(assignmentId)}`, { signal: abort.signal, cache: "no-store" }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "This assigned job is unavailable.");
      if (!abort.signal.aborted) setView(parseAssignedView(body, workspaceId));
    }).catch(cause => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "This assigned job is unavailable."); });
    return () => abort.abort();
  }, [assignmentId, retry, workspaceId]);
  async function action(kind: "accept" | "run") {
    if (!view || readOnly || newWorkBlocked || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/operational-assignments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: kind, assignmentId }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "The assigned job could not be changed.");
      if (kind === "accept") setView(current => current ? { ...current, assignment: operationalAssignmentSchema.parse(body) } : current);
      else setView(current => current ? { ...current, responsibility: { ...current.responsibility, payload: responsibilitySchema.parse(body.responsibility?.payload) } } : current);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The assigned job could not be changed."); }
    finally { setBusy(false); }
  }
  const assignment = view?.assignment;
  const work = view?.responsibility.payload;
  const status = assignment ? effectiveAssignmentStatus(assignment) : null;
  const canRun = !readOnly && !newWorkBlocked && status === "accepted" && Boolean(work && ["ready", "waiting"].includes(work.status));
  return <section className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6" aria-busy={busy}>
    <header className="space-y-2"><p className="text-sm text-gray-muted">Assigned approved job</p><h1 className="font-display text-3xl">{work?.title || "Opening assigned work"}</h1><p className="max-w-2xl text-sm text-gray-muted">{work?.intent || "Checking the exact scope, sponsor, and current permission."}</p></header>
    {error ? <section className="rounded-xl border border-gray-border p-4" aria-labelledby="assignment-unavailable-heading"><h2 id="assignment-unavailable-heading" className="font-medium">Assigned job unavailable</h2><p className="mt-2 text-sm text-gray-muted" role="alert">{error}</p><p className="mt-2 text-sm text-gray-muted">The offer may have expired, been revoked, or your workspace access may have changed.</p><Button className="mt-4" variant="secondary" onClick={() => setRetry(value => value + 1)}>Check again</Button></section> : null}
    {newWorkBlocked && !readOnly ? <p className="text-sm text-gray-muted">{NEW_WORK_PAUSED_COPY}</p> : null}
    {!view && !error ? <p role="status">Opening the exact approved job…</p> : null}
    {view && assignment && work ? <>
      <section className="rounded-xl border border-gray-border p-4" aria-labelledby="assigned-scope-heading">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-wide text-gray-muted">{assignmentKind(assignment.assigneeKind)} assignment</p><h2 id="assigned-scope-heading" className="mt-1 font-medium">Exact approved scope</h2></div><span className="rounded-full border border-gray-border px-3 py-1 text-sm capitalize">{status}</span></div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-gray-muted">Offered by</dt><dd className="mt-1 break-all">{assignment.sponsorEmail}</dd></div><div><dt className="text-gray-muted">Expires</dt><dd className="mt-1">{new Date(assignment.expiresAt).toLocaleString()}</dd></div></dl>
        <ol className="mt-4 space-y-2">{work.steps.map((step, index) => <li key={step.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-border pt-3 text-sm"><span>{index + 1}. {step.operation.replaceAll(".", " ")}</span><span className="text-gray-muted">{step.status.replaceAll("_", " ")}</span></li>)}</ol>
        <p className="mt-4 text-sm text-gray-muted">This permission only operates this approved job. It cannot approve, reconcile, export, change a budget, or start paid work.</p>
      </section>
      {!readOnly && !newWorkBlocked && status === "offered" ? <div className="space-y-2"><Button disabled={busy} onClick={() => void action("accept")}>Accept this assignment</Button><p className="text-sm text-gray-muted">Acceptance is explicit. Nothing runs until you accept and choose to continue.</p></div> : null}
      {canRun ? <div className="space-y-2"><Button disabled={busy} onClick={() => void action("run")}>Run next approved step</Button><p className="text-sm text-gray-muted">Permission and the sponsor’s owner status are checked again immediately before the local action.</p></div> : null}
      {status === "accepted" && work.status === "completed" ? <p role="status" className="text-sm">This assigned job is complete.</p> : null}
      {status === "revoked" || status === "expired" ? <p role="status" className="rounded-xl border border-gray-border p-4 text-sm">This assignment is {status}. No further step can run.</p> : null}
      <details className="text-sm"><summary className="cursor-pointer">Execution history</summary><ol className="mt-3 space-y-2">{work.history.map(event => <li key={event.revision}>{event.kind}{event.detail ? ` · ${event.detail}` : ""}<span className="ml-2 text-gray-muted">{new Date(event.at).toLocaleString()}</span></li>)}</ol></details>
    </> : null}
  </section>;
}

function isAssignable(payload: Responsibility): boolean {
  return Boolean(payload.approvedAt && payload.approvedBy === payload.ownerId && !payload.budgetId
    && ["ready", "waiting"].includes(payload.status)
    && payload.steps.every(step => step.maximumCents === 0
      && ["document.edit", "tracker.command", "investigation.run", "schedule.command"].includes(step.operation)
      && !(step.operation === "tracker.command" && step.input.kind === "coordinate_records")));
}

function OperationalAssignmentPanel({ workspaceId, saved, newWorkBlocked }: { workspaceId: string; saved: Saved; newWorkBlocked?: boolean }) {
  const [assignment, setAssignment] = useState<OperationalAssignment | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [copied, setCopied] = useState(false);
  const [email, setEmail] = useState(""), [kind, setKind] = useState<OperationalAssignment["assigneeKind"]>("staff"), [expires, setExpires] = useState("");
  const offerAttempt = useRef<{ signature: string; key: string } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!expires) { const next = new Date(Date.now() + 24 * 60 * 60 * 1000); next.setSeconds(0, 0); setExpires(next.toISOString().slice(0, 16)); }
  }, [expires]);
  useEffect(() => {
    const abort = new AbortController(); setLoading(true); setError("");
    fetch(`/api/operational-assignments?workId=${encodeURIComponent(saved.id)}`, { signal: abort.signal, cache: "no-store" }).then(async response => {
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "Assignments are unavailable.");
      if (!abort.signal.aborted) setAssignment(body === null ? null : operationalAssignmentSchema.parse(body));
    }).catch(cause => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Assignments are unavailable."); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [retry, saved.id]);
  async function offer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (newWorkBlocked || busy || !expires) return;
    const expiresAt = new Date(expires).toISOString();
    const signature = JSON.stringify([saved.id, email.trim().toLowerCase(), kind, expiresAt]);
    const attempt = offerAttempt.current?.signature === signature ? offerAttempt.current : { signature, key: `offer:${crypto.randomUUID()}` };
    offerAttempt.current = attempt; setBusy(true); setError("");
    try {
      const response = await fetch("/api/operational-assignments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "offer", workId: saved.id, assignment: { assigneeEmail: email, assigneeKind: kind, expiresAt, idempotencyKey: attempt.key } }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "The assignment could not be offered.");
      setAssignment(operationalAssignmentSchema.parse(body)); offerAttempt.current = null;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The assignment could not be offered."); }
    finally { setBusy(false); }
  }
  async function revoke() {
    if (!assignment || busy) return; setBusy(true); setError("");
    try {
      const response = await fetch("/api/operational-assignments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "revoke", assignmentId: assignment.id }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "The assignment could not be revoked.");
      setAssignment(operationalAssignmentSchema.parse(body));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The assignment could not be revoked."); }
    finally { setBusy(false); }
  }
  const status = assignment ? effectiveAssignmentStatus(assignment) : null;
  const canOffer = !newWorkBlocked && isAssignable(saved.payload) && (!assignment || status === "revoked" || status === "expired");
  const link = assignment ? assignmentLink(workspaceId, assignment.id) : "";
  return <section className="rounded-xl border border-gray-border p-4" aria-labelledby="exact-assignment-heading">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm text-gray-muted">One person, one approved job</p><h2 id="exact-assignment-heading" className="mt-1 font-medium">Exact-job assignment</h2></div>{status ? <span className="rounded-full border border-gray-border px-3 py-1 text-sm capitalize">{status}</span> : null}</div>
    <p className="mt-2 max-w-2xl text-sm text-gray-muted">Let a verified workspace member operate only this already-approved, zero-cost job. This does not remove access they already have as a workspace member.</p>
    {loading ? <p className="mt-4 text-sm" role="status">Checking current assignment…</p> : null}
    {error ? <div className="mt-4 text-sm" role="alert"><p>{error}</p><Button className="mt-3" variant="secondary" onClick={() => setRetry(value => value + 1)}>Check again</Button></div> : null}
    {assignment ? <div className="mt-4 space-y-3 border-t border-gray-border pt-4 text-sm"><dl className="grid gap-3 sm:grid-cols-2"><div><dt className="text-gray-muted">Assigned to</dt><dd className="mt-1 break-all">{assignment.assigneeEmail} · {assignmentKind(assignment.assigneeKind)}</dd></div><div><dt className="text-gray-muted">Expires</dt><dd className="mt-1">{new Date(assignment.expiresAt).toLocaleString()}</dd></div></dl><div className="flex flex-wrap gap-2"><a className="inline-flex min-h-8 items-center rounded-full border border-gray-border px-3 text-sm underline underline-offset-2" href={link}>Open assignment link</a><Button variant="secondary" onClick={() => { void navigator.clipboard.writeText(new URL(link, window.location.origin).toString()).then(() => setCopied(true)); }}>{copied ? "Link copied" : "Copy link"}</Button>{status === "offered" || status === "accepted" ? <Button variant="danger" disabled={busy} onClick={() => void revoke()}>Revoke assignment</Button> : null}</div></div> : null}
    {!canOffer && !assignment && !loading && !error ? <p className="mt-4 text-sm" role="status">Assignment is unavailable. Approve a ready, zero-cost job that uses supported local operations first.</p> : null}
    {canOffer ? <form className="mt-4 grid gap-3 border-t border-gray-border pt-4 sm:grid-cols-2" onSubmit={offer}><TextInput type="email" label="Existing member email" value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} /><label className="block text-[11px] text-gray-muted">Relationship label<select className="mt-0.5 min-h-9 w-full rounded-lg border-0 bg-surface-inset px-3.5 py-2 text-[13px] text-warm-black outline-none focus:ring-2 focus:ring-white/10" value={kind} onChange={event => setKind(event.target.value as OperationalAssignment["assigneeKind"])}><option value="staff">Staff</option><option value="agency">Agency</option><option value="strelva">Strelva</option><option value="agent">Agent</option></select></label><TextInput type="datetime-local" label="Permission expires" value={expires} onChange={event => setExpires(event.target.value)} required /><div className="flex items-end"><Button type="submit" disabled={busy || !email || !expires}>Offer exact job</Button></div></form> : null}
  </section>;
}

function FiniteResponsibilityExperience({ workspaceId, workId, sources, readOnly, newWorkBlocked, initialRequest, onSaved }: Props) {
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [saved, setSaved] = useState<Saved | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [targetId, setTargetId] = useState(""), [text, setText] = useState(""), [documentTitle, setDocumentTitle] = useState(""), [documentRevision, setDocumentRevision] = useState<number | null>(null);
  const [intent, setIntent] = useState(initialRequest || ""), [checkId, setCheckId] = useState("");
  const [retryLoad, setRetryLoad] = useState(0);
  useEffect(() => {
    if (!workId) return;
    const abort = new AbortController();
    fetch(`/api/operations?workId=${encodeURIComponent(workId)}`, { signal: abort.signal, cache: "no-store" }).then(async response => {
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "This work could not be opened.");
      if (!abort.signal.aborted) setSaved({ ...body, payload: responsibilitySchema.parse(body.payload) });
    }).catch(cause => { if (!abort.signal.aborted) setError(cause.message); });
    return () => abort.abort();
  }, [workId, retryLoad]);
  useEffect(() => {
    if (!targetId) return;
    const abort = new AbortController();
    fetch(`/api/documents?workId=${encodeURIComponent(targetId)}`, { signal: abort.signal, cache: "no-store" }).then(async response => {
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "The document could not be opened.");
      if (!abort.signal.aborted) { setText(body.document.text); setDocumentTitle(body.document.title); setDocumentRevision(body.document.revision); }
    }).catch(cause => { if (!abort.signal.aborted) setError(cause.message); });
    return () => abort.abort();
  }, [targetId]);
  async function post(body: Record<string, unknown>): Promise<Saved> {
    const response = await fetch("/api/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const value = await response.json(); if (!response.ok) throw new Error(value.error || "This work could not be confirmed.");
    return { ...value, payload: responsibilitySchema.parse(value.payload) };
  }
  async function action(kind: string, extra: Record<string, unknown> = {}) {
    const recoveryAction = kind === "reconcile" || kind === "cancel";
    if (!saved || readOnly || busy || (newWorkBlocked && !recoveryAction)) return;
    setBusy(true); setError("");
    try {
      let base = saved;
      if (kind === "approve" && !base.payload.budgetId) {
        const response = await fetch(`/api/work-economics?workspaceId=${encodeURIComponent(workspaceId)}&workId=${encodeURIComponent(base.id)}`, { cache: "no-store" });
        if (!response.ok) throw new Error("The budget could not be checked. Reload before starting this work.");
        const budget = await response.json();
        if (budget.ledger && budget.ledger.status !== "accepted") throw new Error("Accept the proposed budget before starting this work.");
        if (budget.ledger) base = await post({ action: "command", workId: base.id, command: { kind: "set_budget", expectedRevision: base.payload.revision, budgetId: budget.ledger.id } });
      }
      let current = kind === "run" ? base : await post({ action: "command", workId: base.id, command: { kind, expectedRevision: base.payload.revision, ...extra } });
      if (!alive.current) return;
      setSaved(current);
      if (!newWorkBlocked && (kind === "approve" || kind === "run" || kind === "resume" || kind === "retry" || (kind === "reconcile" && extra.resolution === "completed"))) {
        for (let step = 0; step < 20 && (current.payload.status === "ready" || (step === 0 && current.payload.status === "waiting")); step++) {
          if (!alive.current) break;
          current = await post({ action: "run", workId: current.id }); if (alive.current) setSaved(current);
        }
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The action could not be confirmed."); }
    finally { setBusy(false); }
  }
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (readOnly || newWorkBlocked || busy) return; setBusy(true); setError("");
    try {
      const steps = [];
      if (checkId) steps.push({ id: "check", operation: "investigation.run", workId: checkId, input: {}, dependsOn: [], maximumCents: 0 });
      if (targetId && documentRevision !== null) steps.push({ id: "update", operation: "document.edit", workId: targetId, input: { kind: "edit", expectedRevision: documentRevision, title: documentTitle, text }, dependsOn: checkId ? ["check"] : [], maximumCents: 0 });
      if (!steps.length) throw new Error("Choose a saved check or a document change to delegate.");
      const created = await post({ action: "create", workspaceId, input: { title: intent.slice(0, 160), intent, steps } }); if (alive.current) { setSaved(created); onSaved(created.id); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The proposal could not be saved."); } finally { setBusy(false); }
  }
  const current = saved?.payload;
  return <section className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6" aria-busy={busy}>
    <header><p className="text-sm text-gray-muted">{current ? label[current.status] : "Delegated work"}</p><h1 className="mt-2 font-display text-3xl">{current?.title || "What should Strelva take care of?"}</h1><p className="mt-3 text-sm text-gray-muted">{current?.intent || "Choose an existing check or describe an exact document change. Review the work before it starts."}</p></header>
    {error ? <div role="alert" className="space-y-2 text-sm"><p>{error}</p>{workId ? <Button variant="secondary" onClick={() => { setError(""); setRetryLoad(value => value + 1); }}>Reload current state</Button> : null}</div> : null}
    {readOnly ? <p className="text-sm text-gray-muted">Read-only access. The owner controls execution and decisions.</p> : newWorkBlocked ? <p className="text-sm text-gray-muted">{NEW_WORK_PAUSED_COPY}</p> : null}
    {!current && workId && !error ? <p role="status">Opening saved work…</p> : null}
    {!current && !workId && !readOnly && !newWorkBlocked ? <form onSubmit={create} className="space-y-5">
      <TextInput label="Result you want" value={intent} onChange={event => setIntent(event.target.value)} maxLength={4000} required />
      <label className="block text-sm">Check these sources first (optional)<select className="mt-2 min-h-11 w-full rounded-lg border border-gray-border bg-white p-3" value={checkId} onChange={event => setCheckId(event.target.value)}><option value="">No source check</option>{sources.filter(work => work.productId === "investigations").map(work => <option key={work.id} value={work.id}>{work.title}</option>)}</select></label>
      <label className="block text-sm">Document to update (optional)<select className="mt-2 min-h-11 w-full rounded-lg border border-gray-border bg-white p-3" value={targetId} onChange={event => { setTargetId(event.target.value); setDocumentRevision(null); }}><option value="">No document change</option>{sources.filter(work => work.productId === "documents").map(work => <option key={work.id} value={work.id}>{work.title}</option>)}</select></label>
      {targetId ? documentRevision === null ? <p role="status">Opening the document…</p> : <><TextInput label="Document title after the change" value={documentTitle} onChange={event => setDocumentTitle(event.target.value)} required maxLength={160} /><label className="block text-sm">Document text after the change<textarea className="mt-2 min-h-48 w-full rounded-lg border border-gray-border bg-white p-3" value={text} onChange={event => setText(event.target.value)} maxLength={50000} /></label></> : null}
      <p className="text-sm text-gray-muted">These are private workspace commands. No message is sent, website published, or provider charged.</p>
      <Button type="submit" disabled={busy || Boolean(targetId && documentRevision === null)}>Review proposed work</Button>
    </form> : null}
    {current ? <>
      <ol className="space-y-4">{current.steps.map((step, index) => <li key={step.id} className="rounded-xl border border-gray-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-medium">{index + 1}. {step.operation === "investigation.run" ? "Check the saved sources" : step.operation === "document.edit" ? "Update the document" : step.operation.replaceAll(".", " ")}</h2><span className="text-sm text-gray-muted">{step.status.replaceAll("_", " ")}</span></div>
        <a className="mt-2 inline-block text-sm underline" href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}&work=${encodeURIComponent(step.workId)}`}>Open {sources.find(source => source.id === step.workId)?.title || "the result"}</a>
        {step.reason ? <p className="mt-3 text-sm">{step.reason}</p> : null}{step.wakeAt ? <p className="mt-2 text-sm text-gray-muted">Next check: {new Date(step.wakeAt).toLocaleString()}</p> : null}
        {step.operation === "document.edit" ? <details className="mt-3 text-sm"><summary className="cursor-pointer">Review the exact document change</summary><h3 className="mt-3 font-medium">{String(step.input.title || "Document")}</h3><p className="mt-2 whitespace-pre-wrap break-words">{String(step.input.text || "")}</p></details> : null}
        {["unknown", "accepted", "running"].includes(step.status) && !readOnly ? <details className="mt-3 text-sm"><summary className="cursor-pointer">Resolve an interrupted action</summary><form className="mt-3 space-y-3" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); void action("reconcile", { stepId: step.id, resolution: data.get("resolution"), evidence: data.get("evidence") }); }}><label className="block">Verified outcome<select name="resolution" className="ml-2 border p-2"><option value="completed">The action completed</option>{step.effect !== "accepted" ? <option value="not_applied">The action did not happen</option> : null}</select></label><TextInput name="evidence" label="Evidence from the actual result" required maxLength={2000} /><Button type="submit" disabled={busy}>Record verified outcome</Button></form></details> : null}
      </li>)}</ol>
      {!readOnly ? <OperationalAssignmentPanel workspaceId={workspaceId} saved={saved!} newWorkBlocked={newWorkBlocked} /> : null}
      {!readOnly ? <div className="flex flex-wrap gap-3">
        {!newWorkBlocked && current.status === "proposed" ? <Button disabled={busy} onClick={() => void action("approve")}>Approve and start this work</Button> : null}
        {!newWorkBlocked && (current.status === "ready" || current.status === "waiting") ? <Button disabled={busy} onClick={() => void action("run")}>Continue approved work</Button> : null}
        {!newWorkBlocked && current.status === "paused" ? <Button disabled={busy} onClick={() => void action("resume")}>Resume</Button> : null}
        {!newWorkBlocked && current.status === "needs_attention" && current.steps.some(step => step.status === "failed" && step.effect === "none") ? <Button disabled={busy} onClick={() => void action("retry")}>Retry the failed step</Button> : null}
        {!newWorkBlocked && ["ready", "running", "waiting"].includes(current.status) ? <Button variant="secondary" disabled={busy} onClick={() => void action("pause")}>Pause</Button> : null}
        {!["cancelled", "completed"].includes(current.status) ? <Button variant="secondary" disabled={busy} onClick={() => void action("cancel")}>Cancel remaining work</Button> : null}
      </div> : null}
      <details className="text-sm"><summary className="cursor-pointer">Decisions and execution history</summary><ol className="mt-3 space-y-2">{current.history.map(event => <li key={event.revision}>{event.kind} {event.detail ? `· ${event.detail}` : ""}<span className="ml-2 text-gray-muted">{new Date(event.at).toLocaleString()}</span></li>)}</ol></details>
      <WorkBudgetPanel workspaceId={workspaceId} workId={saved!.id} productId="operations" resourceKind="responsibility" readOnly={readOnly} newWorkBlocked={newWorkBlocked} refreshKey={String(current.revision)} />
    </> : null}
  </section>;
}

type StandingPolicy = {
  id: string;
  workspaceId: string;
  policy: {
    version: number;
    revision: number;
    title: string;
    intent: string;
    status: "proposed" | "active" | "paused" | "revoked";
    scope: { steps: Array<{ id: string; operation: string; workId: string }> };
    trigger: { kind: "manual" } | { kind: "interval"; everySeconds: number; nextAt: string };
    limits: { maxConcurrentJobs: number; maxRuns: number | null };
    exclusions: string[];
    escalation?: string;
    approvedAt?: string;
  };
};
export type StandingResponsibilitySummary = StandingPolicy;
type StandingJob = { id: string; finiteWorkId: string; triggerKey: string; policyVersion: number; status: string; acceptedAt: string };
type StandingReceipt = { stepId: string; attempt: number; status: string; effect: "none" | "accepted" | "unknown"; reason?: string; result?: unknown };
type StandingRun = { id: string; jobId: string; finiteWorkId: string; triggerKey: string; policyVersion: number; status: string; attempt: number; createdAt: string; wakeAt?: string; lastError?: string; receipts: StandingReceipt[] };
type StandingView = { policy: StandingPolicy; jobs: StandingJob[]; runs: StandingRun[] };

type StandingResponsibilityPickerProps = {
  workspaceId: string;
  sources: WorkspaceWork[];
  selectedId?: string;
  readOnly?: boolean;
  newWorkBlocked?: boolean;
  onCreatingChange?: (creating: boolean) => void;
  onOpen(id: string): void;
  onCreated(id: string): void;
};

/**
 * The operations entry point keeps repeatable work beside finite work. It
 * only offers the currently supported, read-only saved investigation scope;
 * all other native mutations remain in the finite responsibility flow.
 */
export function StandingResponsibilityPicker({ workspaceId, sources, selectedId, readOnly, newWorkBlocked, onCreatingChange, onOpen, onCreated }: StandingResponsibilityPickerProps) {
  const [items, setItems] = useState<StandingResponsibilitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [title, setTitle] = useState("Check saved records repeatedly");
  const [intent, setIntent] = useState("Compare the saved records whenever a new check is due.");
  const [sourceId, setSourceId] = useState("");
  const [triggerKind, setTriggerKind] = useState<"manual" | "interval">("manual");
  const [everyMinutes, setEveryMinutes] = useState("60");
  const investigations = sources.filter(source => source.productId === "investigations" && source.resourceKind === "investigation");

  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    fetch(`/api/operations?workspaceId=${encodeURIComponent(workspaceId)}&view=standing`, { signal: abort.signal, cache: "no-store" }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Ongoing work could not be loaded.");
      const responsibilities = Array.isArray(body.responsibilities) ? body.responsibilities : [];
      if (!abort.signal.aborted) setItems(responsibilities as StandingResponsibilitySummary[]);
    }).catch(cause => {
      if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Ongoing work could not be loaded.");
    }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [workspaceId, retry]);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly || newWorkBlocked || busy || !sourceId) return;
    setBusy(true); setError("");
    try {
      const interval = Number(everyMinutes);
      if (triggerKind === "interval" && (!Number.isInteger(interval) || interval < 1)) throw new Error("Choose a valid interval.");
      const response = await fetch("/api/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "standing_create",
          workspaceId,
          input: {
            title,
            intent,
            scope: { steps: [{ id: "check", operation: "investigation.run", workId: sourceId, input: {}, dependsOn: [], maximumCents: 0 }] },
            trigger: triggerKind === "manual"
              ? { kind: "manual" }
              : { kind: "interval", everySeconds: interval * 60, nextAt: new Date(Date.now() + interval * 60_000).toISOString() },
            limits: { maxConcurrentJobs: 1, maxRuns: 10 },
            exclusions: [],
          },
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Ongoing work could not be created.");
      if (typeof body.id !== "string") throw new Error("The new ongoing work record is invalid.");
      setCreating(false);
      onCreatingChange?.(false);
      setRetry(value => value + 1);
      onCreated(body.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ongoing work could not be created.");
    } finally { setBusy(false); }
  }

  return <section className="rounded-xl border border-gray-border p-4" aria-labelledby="ongoing-work-entry-heading">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-sm text-gray-muted">Ongoing work</p><h2 id="ongoing-work-entry-heading" className="mt-1 font-medium">Saved checks that can run again</h2><p className="mt-1 max-w-2xl text-sm text-gray-muted">Each check has its own run and result. The approved scope stays visible for review.</p></div>
      {!readOnly && !newWorkBlocked ? <Button variant="secondary" disabled={busy} onClick={() => { const next = !creating; setCreating(next); onCreatingChange?.(next); setError(""); }}>{creating ? "Close" : "New ongoing work"}</Button> : null}
    </div>
    {newWorkBlocked && !readOnly ? <p className="mt-3 text-sm text-gray-muted">{NEW_WORK_PAUSED_COPY}</p> : null}
    {error ? <p className="mt-3 text-sm" role="alert">{error}</p> : null}
    {loading ? <p className="mt-3 text-sm" role="status">Loading ongoing work…</p> : items.length ? <ul className="mt-4 space-y-2" role="list">{items.map(item => <li key={item.id}><button type="button" className={`w-full rounded-lg border p-3 text-left ${selectedId === item.id ? "border-accent" : "border-gray-border"}`} aria-current={selectedId === item.id ? "page" : undefined} onClick={() => onOpen(item.id)}><span className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{item.policy.title}</span><span className="text-sm text-gray-muted">{standingActionLabel(item.policy.status)}</span></span><span className="mt-1 block text-sm text-gray-muted">Version {item.policy.version} · {item.policy.scope.steps.length} saved check{item.policy.scope.steps.length === 1 ? "" : "s"}</span></button></li>)}</ul> : <p className="mt-4 text-sm text-gray-muted">No ongoing work has been created.</p>}
    {creating && !readOnly && !newWorkBlocked ? <form className="mt-5 space-y-4 border-t border-gray-border pt-4" onSubmit={create}>
      <h3 className="font-medium">New ongoing work</h3>
      <TextInput label="Name" value={title} onChange={event => setTitle(event.target.value)} maxLength={160} required />
      <TextInput label="Result" value={intent} onChange={event => setIntent(event.target.value)} maxLength={4000} required />
      <div className="block text-sm"><label htmlFor="standing-source">Saved check</label><select id="standing-source" className="mt-2 min-h-11 w-full rounded-lg border border-gray-border bg-white p-3" value={sourceId} onChange={event => setSourceId(event.target.value)} required><option value="">Choose a saved investigation</option>{investigations.map(source => <option key={source.id} value={source.id}>{source.title}</option>)}</select></div>
      <div className="block text-sm"><label htmlFor="standing-trigger">When should this check run?</label><select id="standing-trigger" className="mt-2 min-h-11 w-full rounded-lg border border-gray-border bg-white p-3" value={triggerKind} onChange={event => setTriggerKind(event.target.value as "manual" | "interval")}><option value="manual">When I ask</option><option value="interval">On a schedule</option></select></div>
      {triggerKind === "interval" ? <TextInput label="Interval in minutes" type="number" min={1} max={525600} value={everyMinutes} onChange={event => setEveryMinutes(event.target.value)} required /> : null}
      {!investigations.length ? <p className="text-sm text-gray-muted">Create a saved investigation first. Ongoing work currently supports saved checks.</p> : null}
      <p className="text-sm text-gray-muted">No external message or provider call is made by creating this proposal. Approval is required before a check can run. This setup allows up to 10 checks.</p>
      <Button type="submit" disabled={busy || !investigations.length || !sourceId}>Create ongoing work</Button>
    </form> : null}
  </section>;
}

function parseStandingView(value: unknown): StandingView {
  if (!value || typeof value !== "object") throw new Error("The ongoing work response is invalid.");
  const body = value as Partial<StandingView>;
  if (!body.policy || typeof body.policy !== "object" || !Array.isArray(body.jobs) || !Array.isArray(body.runs)) {
    throw new Error("The ongoing work response is incomplete.");
  }
  return { policy: body.policy as StandingPolicy, jobs: body.jobs as StandingJob[], runs: body.runs as StandingRun[] };
}

function standingActionLabel(status: StandingPolicy["policy"]["status"]): string {
  return status === "proposed" ? "Ready for approval" : status === "active" ? "Ready to run" : status === "paused" ? "Paused" : "Revoked";
}

function standingRunLabel(status: string): string {
  return status === "admitted" ? "Accepted" : status === "running" ? "In progress" : status === "waiting" ? "Waiting" : status === "needs_attention" ? "Needs your decision" : status === "completed" ? "Completed" : status === "failed" ? "Could not finish" : status === "cancelled" ? "Cancelled" : status;
}

function StandingResponsibilityExperience({ workspaceId, standingId, sources, readOnly, newWorkBlocked }: Props & { standingId: string }) {
  const alive = useRef(true);
  const [view, setView] = useState<StandingView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retryLoad, setRetryLoad] = useState(0);
  const pendingCheck = useRef<{ triggerKey: string; runId?: string } | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const abort = new AbortController();
    fetch(`/api/operations?standingId=${encodeURIComponent(standingId)}&view=runs`, { signal: abort.signal, cache: "no-store" }).then(async response => {
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "This ongoing work could not be opened.");
      if (!abort.signal.aborted) setView(parseStandingView(body));
    }).catch(cause => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "This ongoing work could not be opened."); });
    return () => abort.abort();
  }, [standingId, retryLoad]);

  async function postStanding(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await fetch("/api/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || "The ongoing work change could not be confirmed.");
    return result as Record<string, unknown>;
  }
  async function action(body: Record<string, unknown>) {
    const command = body.action === "standing_command" && body.command && typeof body.command === "object" ? body.command as { kind?: unknown } : null;
    const recoveryAction = body.action === "standing_reconcile" || body.action === "standing_cancel" || command?.kind === "revoke";
    if (readOnly || busy || !view || (newWorkBlocked && !recoveryAction)) return;
    setBusy(true); setError("");
    try { await postStanding(body); if (alive.current) setRetryLoad(value => value + 1); }
    catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : "The ongoing work change could not be confirmed."); }
    finally { if (alive.current) setBusy(false); }
  }
  async function runCheck() {
    if (readOnly || newWorkBlocked || busy || !view || view.policy.policy.status !== "active") return;
    setBusy(true); setError("");
    try {
      const pending = pendingCheck.current || { triggerKey: `manual:${Date.now()}` };
      pendingCheck.current = pending;
      if (!pending.runId) {
        const admitted = await postStanding({
          action: "standing_admit",
          standingId,
          input: { triggerKey: pending.triggerKey, expectedVersion: view.policy.policy.version },
        });
        const run = admitted.run;
        if (!run || typeof run !== "object" || typeof (run as { id?: unknown }).id !== "string") throw new Error("The accepted job did not include a run.");
        pending.runId = (run as { id: string }).id;
      }
      await postStanding({ action: "standing_run", runId: pending.runId });
      pendingCheck.current = null;
      if (alive.current) setRetryLoad(value => value + 1);
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : "The check could not be started.");
    } finally { if (alive.current) setBusy(false); }
  }
  async function reconcile(run: StandingRun, event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (readOnly || busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      const currentResponse = await fetch(`/api/operations?workId=${encodeURIComponent(run.finiteWorkId)}`, { cache: "no-store" });
      const current = await currentResponse.json(); if (!currentResponse.ok) throw new Error(current.error || "The finite job could not be opened.");
      const command = { kind: "reconcile", expectedRevision: current.payload.revision, stepId: data.get("stepId"), resolution: data.get("resolution"), evidence: data.get("evidence") };
      await postStanding({ action: "standing_reconcile", runId: run.id, command });
      if (alive.current) setRetryLoad(value => value + 1);
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : "The run decision could not be confirmed."); }
    finally { if (alive.current) setBusy(false); }
  }
  const policy = view?.policy.policy;
  const sourceTitle = (workId: string) => sources.find(source => source.id === workId)?.title || "Saved check";
  return <section className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6" aria-busy={busy}>
    <header className="space-y-2">
      <p className="text-sm text-gray-muted">Ongoing work</p>
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="font-display text-3xl">{policy?.title || "Ongoing work"}</h1><p className="mt-2 max-w-2xl text-sm text-gray-muted">{policy?.intent || "Opening the approved scope and its runs."}</p></div>{policy ? <span className="rounded-full border border-gray-border px-3 py-1 text-sm">{standingActionLabel(policy.status)}</span> : null}</div>
    </header>
    {error ? <div role="alert" className="space-y-2 text-sm"><p>{error}</p><Button variant="secondary" onClick={() => { setError(""); setRetryLoad(value => value + 1); }}>Reload current state</Button></div> : null}
    {readOnly ? <p className="text-sm text-gray-muted">Read-only access. The owner or workspace admin makes changes and decisions.</p> : newWorkBlocked ? <p className="text-sm text-gray-muted">{NEW_WORK_PAUSED_COPY}</p> : null}
    {!view && !error ? <p role="status">Opening ongoing work…</p> : null}
    {view && policy ? <>
      <section className="rounded-xl border border-gray-border p-4" aria-labelledby="standing-scope-heading"><div className="flex flex-wrap items-baseline justify-between gap-3"><h2 id="standing-scope-heading" className="font-medium">What it checks</h2><p className="text-sm text-gray-muted">{policy.status === "proposed" ? "Proposed version" : "Approved version"} {policy.version}</p></div><ul className="mt-3 space-y-2 text-sm" role="list">{policy.scope.steps.map(step => <li key={step.id} className="flex flex-wrap items-center justify-between gap-2"><span>{sourceTitle(step.workId)}</span><a className="underline" href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}&work=${encodeURIComponent(step.workId)}`}>Open saved record</a></li>)}</ul><p className="mt-3 text-sm text-gray-muted">{policy.trigger.kind === "manual" ? "Run this saved check whenever you need one." : `Runs follow a ${Math.round(policy.trigger.everySeconds / 60)} minute schedule · next check ${new Date(policy.trigger.nextAt).toLocaleString()}`}</p><p className="mt-2 text-sm text-gray-muted">{policy.limits.maxRuns === null ? "There is no fixed check limit in this setup." : `Up to ${policy.limits.maxRuns} checks can run with this setup.`}</p>{policy.exclusions.length || policy.escalation ? <p className="mt-2 text-sm text-gray-muted">Operator notes: {[...policy.exclusions, policy.escalation].filter(Boolean).join(" · ")}</p> : null}</section>
      <section className="rounded-xl border border-gray-border p-4" aria-labelledby="standing-runs-heading"><div className="flex items-baseline justify-between gap-3"><h2 id="standing-runs-heading" className="font-medium">Runs</h2><span className="text-sm text-gray-muted">{view.runs.length}</span></div>{view.runs.length ? <ul className="mt-3 space-y-3" role="list">{view.runs.map(run => <li key={run.id} className="border-t border-gray-border pt-3 text-sm"><div className="flex flex-wrap justify-between gap-3"><span className="font-medium">{sourceTitle(policy.scope.steps[0]?.workId || "")}</span><span>{standingRunLabel(run.status)}</span></div><p className="mt-1 text-gray-muted">Checked {new Date(run.createdAt).toLocaleString()}</p>{run.wakeAt ? <p className="mt-1 text-gray-muted">Waiting until {new Date(run.wakeAt).toLocaleString()}</p> : null}{run.lastError ? <p className="mt-1" role="alert">{run.lastError}</p> : null}<div className="mt-2 flex flex-wrap gap-2">{!readOnly && !["completed", "cancelled"].includes(run.status) ? <>{!newWorkBlocked ? <Button disabled={busy} onClick={() => void action({ action: "standing_run", runId: run.id })}>Continue run</Button> : null}<Button variant="secondary" disabled={busy} onClick={() => void action({ action: "standing_cancel", runId: run.id })}>Cancel run</Button></> : null}</div>{run.receipts.some(receipt => ["unknown", "accepted", "running"].includes(receipt.status)) && !readOnly ? <details className="mt-3"><summary className="cursor-pointer">Resolve an exception</summary><form className="mt-3 space-y-3" onSubmit={event => void reconcile(run, event)}><input type="hidden" name="stepId" value={run.receipts.find(receipt => ["unknown", "accepted", "running"].includes(receipt.status))?.stepId || ""} /><label className="block">Verified outcome<select name="resolution" className="ml-2 border border-gray-border p-2"><option value="completed">The action completed</option>{run.receipts.some(receipt => receipt.effect !== "accepted") ? <option value="not_applied">The action did not happen</option> : null}</select></label><TextInput name="evidence" label="Evidence from the actual result" required maxLength={2000} /><Button type="submit" disabled={busy}>Record decision</Button></form></details> : null}<details className="mt-3 text-sm"><summary className="cursor-pointer text-gray-muted">Run details</summary><ul className="mt-2 space-y-1 text-gray-muted" role="list">{run.receipts.map(receipt => <li key={`${receipt.stepId}-${receipt.attempt}`}>{receipt.stepId} · {receipt.status} · effect {receipt.effect}</li>)}</ul></details></li>)}</ul> : <p className="mt-3 text-sm text-gray-muted">No runs yet.</p>}</section>
      <section className="rounded-xl border border-gray-border p-4" aria-labelledby="standing-decisions-heading"><div className="flex flex-wrap items-baseline justify-between gap-3"><h2 id="standing-decisions-heading" className="font-medium">Decisions</h2><span className="text-sm text-gray-muted">Receipts remain attached to each run.</span></div><p className="mt-2 text-sm text-gray-muted">Completed and uncertain outcomes stay visible after cancellation so a later decision cannot repeat a check blindly.</p></section>
      <details className="rounded-xl border border-gray-border p-4"><summary className="cursor-pointer font-medium">History</summary><p className="mt-3 text-sm text-gray-muted">Current policy revision {policy.revision}.</p><section className="mt-4" aria-labelledby="standing-jobs-heading"><div className="flex items-baseline justify-between gap-3"><h2 id="standing-jobs-heading" className="font-medium">Jobs</h2><span className="text-sm text-gray-muted">{view.jobs.length}</span></div>{view.jobs.length ? <ul className="mt-3 space-y-3" role="list">{view.jobs.map(job => <li key={job.id} className="border-t border-gray-border pt-3 text-sm"><div className="flex justify-between gap-3"><span className="font-medium">{sourceTitle(policy.scope.steps[0]?.workId || "")}</span><span className="text-gray-muted">{job.status === "accepted" ? "Accepted" : "Cancelled"}</span></div><p className="mt-1 text-gray-muted">Accepted {new Date(job.acceptedAt).toLocaleString()}</p><details className="mt-2"><summary className="cursor-pointer text-gray-muted">Job details</summary><p className="mt-2 text-gray-muted">Trigger {job.triggerKey} · approved version {job.policyVersion}</p></details></li>)}</ul> : <p className="mt-3 text-sm text-gray-muted">No jobs have been admitted.</p>}</section></details>
      {!readOnly ? <div className="flex flex-wrap gap-3">{!newWorkBlocked && policy.status === "proposed" ? <Button disabled={busy} onClick={() => void action({ action: "standing_command", standingId, command: { kind: "approve", expectedRevision: policy.revision } })}>Approve ongoing work</Button> : null}{!newWorkBlocked && policy.status === "active" ? <Button variant="secondary" disabled={busy} onClick={() => void action({ action: "standing_command", standingId, command: { kind: "pause", expectedRevision: policy.revision } })}>Pause</Button> : null}{!newWorkBlocked && policy.status === "paused" ? <Button disabled={busy} onClick={() => void action({ action: "standing_command", standingId, command: { kind: "resume", expectedRevision: policy.revision } })}>Resume</Button> : null}{policy.status !== "revoked" ? <Button variant="secondary" disabled={busy} onClick={() => void action({ action: "standing_command", standingId, command: { kind: "revoke", expectedRevision: policy.revision } })}>Stop</Button> : null}{!newWorkBlocked && policy.status === "active" ? <Button disabled={busy} onClick={() => void runCheck()}>Run now</Button> : null}</div> : null}
    </> : null}
  </section>;
}
