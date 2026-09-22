"use client";

import { onboardingRequestPrefill } from "./request-prefill";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SelectInput, TextArea, TextInput } from "@/components/ui/TextInput";
import type { OnboardingAttachableDocument, OnboardingCase, OnboardingCaseRecord, OnboardingDocumentRecord, OnboardingRequirement } from "./contracts";

export type OnboardingExperienceProps = {
  workspaceId: string;
  initialCaseId?: string;
  initialRequest?: string;
  /** Lets the common workspace refresh its saved-work selection after a mutation. */
  onSaved?: (workId: string) => void;
  /** Delegated readers can inspect the case without seeing mutation controls. */
  readOnly?: boolean;
};

const statusLabel: Record<OnboardingRequirement["status"], string> = {
  missing: "Missing",
  supplied: "Supplied",
  correction: "Correction needed",
  accepted: "Accepted",
};

const caseLabel = (value: OnboardingCase["subjectType"]): string => value[0]!.toUpperCase() + value.slice(1);

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "The onboarding request could not be completed.");
  return body as T;
}

export function OnboardingExperience(props: OnboardingExperienceProps) {
  const request = props.initialRequest || "";
  return <OnboardingSession key={`${props.workspaceId}:${props.initialCaseId || request}`} {...props} initialRequest={request} />;
}

function OnboardingSession({ workspaceId, initialCaseId, initialRequest = "", onSaved, readOnly = false }: OnboardingExperienceProps) {
  const [records, setRecords] = useState<OnboardingCaseRecord[]>([]);
  const [availableDocuments, setAvailableDocuments] = useState<OnboardingAttachableDocument[]>([]);
  const [selectedId, setSelectedId] = useState(initialCaseId ?? "");
  const [loading, setLoading] = useState(true);
  const [mutating, setBusy] = useState(false);
  const [pendingCaseId, setPendingCaseId] = useState("");
  const mutation = useRef(false);
  const awaitingShell = Boolean(onSaved && pendingCaseId && initialCaseId !== pendingCaseId);
  const busy = mutating || loading || awaitingShell;
  const [error, setError] = useState("");
  const [document, setDocument] = useState<OnboardingDocumentRecord | null>(null);
  const [uploadRequirementId, setUploadRequirementId] = useState("");
  const [title, setTitle] = useState("");
  const [subjectType, setSubjectType] = useState<OnboardingCase["subjectType"]>(() => onboardingRequestPrefill(initialRequest).subjectType);
  const [subjectLabel, setSubjectLabel] = useState("");
  const [requirementsText, setRequirementsText] = useState(() => onboardingRequestPrefill(initialRequest).requirementsText);
  const [fieldLabel, setFieldLabel] = useState("");
  const [assigneeEmail, setAssigneeEmail] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const refreshGeneration = useRef(0);

  const selected = useMemo(() => selectedId ? records.find((record) => record.workId === selectedId) : records[0], [records, selectedId]);

  async function refresh(caseId?: string) {
    const generation = ++refreshGeneration.current;
    const query = caseId ? `&caseId=${encodeURIComponent(caseId)}` : "";
    const result = await request<{ cases?: OnboardingCaseRecord[]; documents?: OnboardingAttachableDocument[]; workId?: string; case?: OnboardingCase }>(`/api/onboarding?workspaceId=${encodeURIComponent(workspaceId)}&includeDocuments=1${query}`);
    if (generation !== refreshGeneration.current) return;
    setAvailableDocuments(result.documents ?? []);
    if (caseId && result.case && result.workId) {
      setRecords((current) => current.some((record) => record.workId === result.workId)
        ? current.map((record) => record.workId === result.workId ? result as OnboardingCaseRecord : record)
        : [result as OnboardingCaseRecord, ...current]);
      setSelectedId(result.workId);
    } else {
      setRecords(result.cases ?? []);
      if (!selectedId && result.cases?.[0]) setSelectedId(result.cases[0].workId);
    }
  }

  useEffect(() => {
    let live = true;
    setLoading(true);
    void refresh(initialCaseId).catch((cause) => { if (live) setError(cause instanceof Error ? cause.message : "Onboarding is unavailable."); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; refreshGeneration.current += 1; };
    // The selected case is intentionally not a dependency: refresh is an initial load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, initialCaseId]);

  async function change(action: Record<string, unknown>) {
    if (mutation.current || loading || awaitingShell) return null;
    if (readOnly) {
      setError("This onboarding case is read-only for your account.");
      return null;
    }
    mutation.current = true;
    setBusy(true); setError("");
    refreshGeneration.current += 1;
    try {
      const result = await request<OnboardingCaseRecord>("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) });
      setRecords((current) => current.some((record) => record.workId === result.workId) ? current.map((record) => record.workId === result.workId ? result : record) : [result, ...current]);
      setSelectedId(result.workId);
      setDocument(null);
      if (action.action === "create" && onSaved) {
        // The shell replaces the new-case editor after selecting the saved row.
        // Do not allow an upload to begin in the editor being handed off.
        setPendingCaseId(result.workId);
        onSaved(result.workId);
      }
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The onboarding change could not be saved.");
      return null;
    } finally { refreshGeneration.current += 1; mutation.current = false; setBusy(false); }
  }

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly) return;
    const labels = requirementsText.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
    if (!labels.length) { setError("Add at least one requirement before creating the case."); return; }
    const result = await change({ action: "create", input: { workspaceId, title, subjectType, subjectLabel, requirements: labels.map((label, index) => ({ key: label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || `required_document_${index + 1}`, label, fields: index === 0 && fieldLabel.trim() ? [{ key: fieldLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_"), label: fieldLabel.trim() }] : [] })) } });
    if (result) { setTitle(""); setSubjectLabel(""); setRequirementsText(""); setFieldLabel(""); }
  }

  async function upload(file: File, requirementId?: string) {
    if (!selected || readOnly || mutation.current || loading || awaitingShell) return;
    const requirement = selected.case.requirements.find((item) => item.id === requirementId) ?? selected.case.requirements.find((item) => item.status !== "accepted") ?? selected.case.requirements[0];
    if (!requirement) return;
    mutation.current = true;
    setBusy(true); setError("");
    refreshGeneration.current += 1;
    try {
      const form = new FormData();
      form.set("workspaceId", workspaceId); form.set("caseId", selected.workId); form.set("requirementId", requirement.id); form.set("file", file);
      const result = await request<OnboardingCaseRecord>("/api/onboarding/upload", { method: "POST", body: form });
      setRecords((current) => current.map((record) => record.workId === result.workId ? result : record));
      setDocument(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The file could not be supplied."); }
    finally { refreshGeneration.current += 1; mutation.current = false; setBusy(false); }
  }

  async function reopen(requirement: OnboardingRequirement) {
    if (!requirement.document || busy) return;
    setError(""); setBusy(true);
    try { setDocument(await request<OnboardingDocumentRecord>(`/api/onboarding?documentWorkId=${encodeURIComponent(requirement.document.workId)}`)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The private file could not be reopened."); }
    finally { setBusy(false); }
  }

  return (
    <section data-onboarding-experience className="bg-surface-base px-4 py-8 text-warm-black sm:px-8 sm:py-12">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="space-y-5">
          <header>
            <p className="text-sm text-gray-muted">Private onboarding</p>
            <h1 className="mt-2 font-display text-3xl">Collect the right records.</h1>
            <p className="mt-3 text-sm leading-6 text-gray-muted">Keep each requirement, document version, reviewer, and decision together. Automatic extraction stays proposed until a person accepts it.</p>
          </header>
          {initialRequest && !initialCaseId ? <aside className="rounded-xl border border-gray-border p-4 text-sm"><h2 className="font-medium">Your request</h2><p className="mt-2 whitespace-pre-wrap text-gray-muted">{initialRequest}</p></aside> : null}
          {readOnly ? <p className="rounded-xl border border-gray-border bg-surface-inset px-4 py-3 text-sm text-gray-muted">This case is available for review only.</p> : <Card padding="md">
            <h2 className="font-medium">Start an onboarding case</h2>
            <form className="mt-4 grid gap-3" onSubmit={(event) => void create(event)}>
              <TextInput label="Case title" value={title} onChange={(event) => setTitle(event.target.value)} required placeholder="New supplier" />
              <SelectInput label="Subject" value={subjectType} onChange={(event) => setSubjectType(event.target.value as OnboardingCase["subjectType"])} options={[{ value: "customer", label: "Customer" }, { value: "employee", label: "Employee" }, { value: "supplier", label: "Supplier" }]} />
              <TextInput label={`${caseLabel(subjectType)} name`} value={subjectLabel} onChange={(event) => setSubjectLabel(event.target.value)} required placeholder="Name" />
              <TextArea label="Requirements" value={requirementsText} onChange={(event) => setRequirementsText(event.target.value)} required placeholder="Proof of identity\nSigned agreement" />
              <TextInput label="Field on first requirement (optional)" value={fieldLabel} onChange={(event) => setFieldLabel(event.target.value)} placeholder="Legal name" />
              <Button type="submit" loading={busy} disabled={busy}>Create case</Button>
            </form>
          </Card>}
          <section aria-labelledby="onboarding-cases-heading">
            <h2 id="onboarding-cases-heading" className="text-xs font-medium uppercase tracking-[0.16em] text-gray-muted">Cases</h2>
            {loading ? <p className="mt-3 text-sm text-gray-muted" role="status">Loading cases…</p> : records.length ? <ul className="mt-3 grid gap-2">{records.map((record) => <li key={record.workId}><button type="button" disabled={busy} className={`w-full rounded-xl border px-3 py-3 text-left text-sm ${record.workId === selected?.workId ? "border-accent bg-surface" : "border-gray-border bg-surface-inset"}`} onClick={() => { if (!busy) { setSelectedId(record.workId); setDocument(null); } }}><span className="block font-medium">{record.case.title}</span><span className="mt-1 block text-xs text-gray-muted">{caseLabel(record.case.subjectType)} · {record.case.status === "complete" ? "Complete" : `${record.case.requirements.filter((item) => item.status === "accepted").length}/${record.case.requirements.length} accepted`}</span></button></li>)}</ul> : <p className="mt-3 text-sm text-gray-muted">No private cases yet.</p>}
          </section>
        </aside>

        <section aria-labelledby="onboarding-detail-heading" className="min-w-0">
          {awaitingShell ? <p role="status" className="rounded-xl border border-gray-border p-4 text-sm">Your case is saved. Opening its workspace record before another change. <a className="underline" href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}&view=onboarding&work=${encodeURIComponent(pendingCaseId)}`}>Reopen the saved case</a></p> : null}
          {error ? <p role="alert" className="mb-4 rounded-xl border border-terra/40 bg-terra/10 px-4 py-3 text-sm text-terra">{error}</p> : null}
          {!selected ? <Card padding="lg"><h2 id="onboarding-detail-heading" className="font-display text-2xl">Choose a case to begin.</h2><p className="mt-2 text-sm text-gray-muted">A case keeps the person or business subject separate from the files they supply.</p></Card> : <div className="space-y-5">
            <Card padding="lg">
              <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm text-gray-muted">{caseLabel(selected.case.subjectType)} · {selected.case.subjectLabel}</p><h2 id="onboarding-detail-heading" className="mt-1 font-display text-3xl">{selected.case.title}</h2></div><span className="rounded-full border border-gray-border px-3 py-1 text-xs text-gray-muted">{selected.case.status === "complete" ? "Complete" : "In progress"}</span></div>
              {!readOnly ? <div className="mt-5 flex flex-wrap items-end gap-3"><div className="min-w-[15rem] flex-1"><TextInput label="Assignee email" type="email" value={assigneeEmail} onChange={(event) => setAssigneeEmail(event.target.value)} placeholder={selected.case.assignee?.email ?? "reviewer@example.com"} /></div><Button variant="secondary" disabled={busy || !assigneeEmail.trim()} onClick={() => void change({ action: "assign", caseId: selected.workId, email: assigneeEmail })}>Assign reviewer</Button></div> : null}
              {selected.case.assignee ? <p className="mt-3 text-xs text-gray-muted">Assigned to {selected.case.assignee.email}. Assignment changes remain in history.</p> : <p className="mt-3 text-xs text-gray-muted">No reviewer assigned yet.</p>}
            </Card>
            <section aria-labelledby="requirements-heading" className="space-y-4"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm text-gray-muted">Visible outstanding items</p><h3 id="requirements-heading" className="font-display text-2xl">Requirements</h3></div>{!readOnly ? <Button variant="secondary" disabled={busy} onClick={() => fileInput.current?.click()}>Supply a private file</Button> : null}{!readOnly ? <input ref={fileInput} className="sr-only" type="file" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file, uploadRequirementId); setUploadRequirementId(""); event.currentTarget.value = ""; }} /> : null}</div>
              <p className="text-xs leading-5 text-gray-muted">Private files can be up to 2 MB. Plain text, CSV, and JSON are parsed locally; other formats stay available for manual review when extraction is unavailable.</p>
              {selected.case.requirements.map((requirement) => <RequirementCard key={`${requirement.id}:${requirement.document?.workId ?? "none"}:${requirement.status}:${requirement.reviewedData ? "reviewed" : "proposed"}:${requirement.stale ? "stale" : "current"}`} requirement={requirement} availableDocuments={availableDocuments} busy={busy} readOnly={readOnly} onSupply={() => { setUploadRequirementId(requirement.id); fileInput.current?.click(); }} onAttach={(documentWorkId) => void change({ action: "attach", workspaceId, caseId: selected.workId, requirementId: requirement.id, documentWorkId })} onReview={(values) => void change({ action: "review", caseId: selected.workId, requirementId: requirement.id, values })} onAccept={() => void change({ action: "accept", caseId: selected.workId, requirementId: requirement.id })} onCorrection={() => void change({ action: "correction", caseId: selected.workId, requirementId: requirement.id, note: "Please supply a corrected document." })} onReopen={() => void reopen(requirement)} />)}
              {document ? <Card padding="md"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-medium">{document.title}</h3><p className="mt-1 text-xs text-gray-muted">Private file · {document.provenance.originalName} · {document.provenance.sha256.slice(0, 12)}…</p><p className="mt-2 text-sm text-gray-muted">{document.extraction.message}</p></div><div className="flex flex-wrap items-center gap-3"><span className="text-xs text-gray-muted">{document.extraction.status === "available" ? "Parsed locally" : "Extraction unavailable"}</span><a className="inline-flex min-h-10 items-center rounded-xl border border-gray-border px-4 text-sm font-medium text-warm-black hover:bg-gray-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" href={`/api/onboarding/file?workId=${encodeURIComponent(document.workId)}`} download={document.provenance.originalName}>Download original file</a></div></div><pre className="mt-4 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-bg p-3 text-sm">{document.text || "No text was extracted from this file. Download the original file for manual review."}</pre></Card> : null}
            </section>
            <Card padding="md"><h3 className="font-medium">History</h3><ol aria-label="Onboarding case history" className="mt-3 grid gap-2 text-sm">{selected.case.history.slice().reverse().map((entry) => <li key={`${entry.revision}-${entry.kind}`} className="border-b border-gray-border pb-2 last:border-0"><span className="font-medium">{entry.kind.replaceAll("_", " ")}</span><span className="ml-2 text-gray-muted">revision {entry.revision} · {new Date(entry.at).toLocaleString()}</span></li>)}</ol></Card>
          </div>}
        </section>
      </div>
    </section>
  );
}

function RequirementCard({ requirement, availableDocuments, busy, readOnly, onSupply, onAttach, onReview, onAccept, onCorrection, onReopen }: { requirement: OnboardingRequirement; availableDocuments: OnboardingAttachableDocument[]; busy: boolean; readOnly: boolean; onSupply: () => void; onAttach: (documentWorkId: string) => void; onReview: (values: Record<string, string>) => void; onAccept: () => void; onCorrection: () => void; onReopen: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(requirement.reviewedData ?? requirement.proposedData);
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  return <Card padding="md"><div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-medium">{requirement.label}</h4><p className="mt-1 text-xs text-gray-muted">{statusLabel[requirement.status]}{requirement.document ? ` · document revision ${requirement.document.revision}` : ""}{requirement.document?.source === "saved_document" ? " · saved document" : ""}</p></div>{requirement.document?.source !== "saved_document" && requirement.document ? <Button size="sm" variant="ghost" disabled={busy} onClick={onReopen}>Reopen private file</Button> : null}</div>
    {requirement.stale ? <p role="alert" className="mt-4 rounded-lg border border-terra/40 bg-terra/10 px-3 py-2 text-sm text-terra">The linked saved document changed after revision {requirement.document?.revision}. Attach its current revision before reviewing or accepting it.</p> : requirement.document?.extraction.status === "unavailable" ? <p className="mt-4 rounded-lg bg-gray-bg px-3 py-2 text-sm text-gray-muted">Automatic extraction unavailable for this file. {requirement.document.extraction.message} Enter the information manually, then review it.</p> : requirement.document ? <p className="mt-4 rounded-lg bg-gray-bg px-3 py-2 text-sm text-gray-muted">Proposed information is a draft. {requirement.document.extraction.message}</p> : <p className="mt-4 text-sm text-gray-muted">No document supplied yet.</p>}
    {!readOnly && !requirement.document && availableDocuments.length ? <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end"><div className="min-w-0 flex-1"><SelectInput label="Attach existing saved document" value={selectedDocumentId} onChange={(event) => setSelectedDocumentId(event.target.value)} options={[{ value: "", label: "Choose a saved document" }, ...availableDocuments.map((document) => ({ value: document.workId, label: `${document.title} · revision ${document.revision}` }))]} /></div><Button size="sm" variant="secondary" disabled={busy || !selectedDocumentId} onClick={() => { onAttach(selectedDocumentId); setSelectedDocumentId(""); }}>Attach current revision</Button></div> : null}
    {!readOnly && requirement.stale && availableDocuments.length ? <div className="mt-4 flex-col gap-2 sm:flex-row sm:items-end"><div className="min-w-0 flex-1"><SelectInput label="Replace with current saved revision" value={selectedDocumentId} onChange={(event) => setSelectedDocumentId(event.target.value)} options={[{ value: "", label: "Choose a saved document" }, ...availableDocuments.map((document) => ({ value: document.workId, label: `${document.title} · revision ${document.revision}` }))]} /></div><Button size="sm" variant="secondary" disabled={busy || !selectedDocumentId} onClick={() => { onAttach(selectedDocumentId); setSelectedDocumentId(""); }}>Use current revision</Button></div> : null}
    {requirement.fields.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2">{requirement.fields.map((field) => <TextInput key={field.key} label={field.label} value={values[field.key] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} disabled={readOnly || busy || !requirement.document || requirement.status === "accepted"} />)}</div> : null}
    {!readOnly && requirement.document ? <div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="secondary" disabled={busy || requirement.status === "accepted"} onClick={() => onReview(values)}>Save review</Button><Button size="sm" disabled={busy || requirement.status === "accepted" || !requirement.reviewedData} onClick={onAccept}>Accept this version</Button>{requirement.status !== "accepted" ? <Button size="sm" variant="ghost" disabled={busy} onClick={onCorrection}>Request correction</Button> : null}</div> : !readOnly && !requirement.document ? <div className="mt-4"><Button size="sm" variant="secondary" disabled={busy} onClick={onSupply}>Supply this file</Button></div> : null}
  </Card>;
}
