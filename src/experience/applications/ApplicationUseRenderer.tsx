"use client";

import { FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { StCopy, StEmpty, StField, StHead, StLabel, StMono, StNotice, StPage, StPill, StRows, StRow, StSection, StState, StSurface, StTextButton, StTextField } from "@/components/ui/strelva/Kit";
import styles from "./application-use.module.css";
import type { ApplicationUseSnapshot, ApplicationViewKind } from "@/products/applications/client";

export interface ApplicationUseDraft {
  values: Record<string, string | number | boolean>;
  recordId: string;
  idempotencyKey: string;
  expectedRecordRevision?: number;
  editingRecordId?: string;
}

export interface ApplicationUseRendererProps {
  presentation?: "preview";
  recordSummaryField?: string;
  snapshot: ApplicationUseSnapshot;
  draft: ApplicationUseDraft;
  busy?: boolean;
  submitError?: string | null;
  submitMessage?: string | null;
  onReload?: () => void;
  onDraftChange: (draft: ApplicationUseDraft) => void;
  onSubmit: (draft: ApplicationUseDraft) => void;
}

function viewLabel(kind: ApplicationViewKind): string {
  if (kind === "form") return "Submit a record";
  if (kind === "list") return "Records";
  if (kind === "detail") return "Record details";
  return "Documents";
}

function displayValue(value: string | number | boolean | undefined): string {
  if (value === undefined || value === "") return "Not provided";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function fieldInputType(type: "text" | "number" | "boolean" | "date" | "contact" | "assigned_person"): "text" | "number" | "date" | "email" {
  if (type === "number") return "number";
  if (type === "date") return "date";
  if (type === "assigned_person") return "email";
  return "text";
}

/** Link fields take what a person knows: an email or phone, a staff email. */
function fieldPlaceholder(type: string): string | undefined {
  if (type === "contact") return "Email or phone";
  if (type === "assigned_person") return "Staff member's email";
  return undefined;
}

const LINK_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function nextIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ApplicationUseRenderer({
  presentation,
  recordSummaryField,
  snapshot,
  draft,
  busy = false,
  submitError,
  submitMessage,
  onReload,
  onDraftChange,
  onSubmit,
}: ApplicationUseRendererProps) {
  const instanceId = useId();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const formView = snapshot.views.find(view => view.kind === "form");
  const editAllowed = snapshot.access.recordEdit === "own" || snapshot.access.recordEdit === "all";
  const editing = draft.editingRecordId !== undefined;
  useEffect(() => {
    if (snapshot.records.some(record => record.id === draft.editingRecordId && record.linkLabels)) {
      formRef.current?.querySelector<HTMLInputElement>("input, select")?.focus();
    }
  }, [draft.editingRecordId, snapshot.records]);
  const recordViews = snapshot.views.filter(view => view.kind === "list" || view.kind === "detail" || view.kind === "document");
  const recordsHeading = recordViews.some(view => view.kind !== "document") ? "Records" : "Documents";
  const recordFields = useMemo(() => {
    const seen = new Set<string>();
    return recordViews.flatMap(view => view.fields).filter(field => {
      if (seen.has(field.id)) return false;
      seen.add(field.id);
      return true;
    });
  }, [recordViews]);

  function updateValue(fieldId: string, value: string | number | boolean | undefined) {
    const values = { ...draft.values };
    if (value === undefined || value === "") delete values[fieldId];
    else values[fieldId] = value;
    onDraftChange({ ...draft, values });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(draft);
  }

  function beginEdit(record: ApplicationUseSnapshot["records"][number]) {
    if (record.revision === undefined) return;
    setAdding(true);
    const editableFields = new Set(formView?.fields.map(field => field.id) ?? []);
    onDraftChange({
      values: Object.fromEntries(Object.entries(record.values).filter(([fieldId]) => editableFields.has(fieldId))),
      recordId: record.id,
      idempotencyKey: nextIdempotencyKey(),
      expectedRecordRevision: record.revision,
      editingRecordId: record.id,
    });
  }

  function cancelEdit() {
    setAdding(false);
    onDraftChange({ values: {}, recordId: nextIdempotencyKey(), idempotencyKey: nextIdempotencyKey() });
  }

  const selectedRecord = snapshot.records.find(record => record.id === selectedId) ?? snapshot.records[0];
  const formOpen = presentation === "preview" || adding || editing || snapshot.records.length === 0 || recordViews.length === 0 || snapshot.access.recordRead === "none" || Boolean(submitError);
  const Container = presentation === "preview" ? "div" : StPage;
  return (
    <Container>
      {presentation === "preview" ? <StLabel as="h3">{snapshot.title}</StLabel> : <StHead title={snapshot.title} meta={<><StState kind="live">Live</StState> · release <StMono>{snapshot.releaseVersion}</StMono> · internal tool</>}
        actions={formView && snapshot.access.recordSubmit && !formOpen ? <StPill onClick={() => setAdding(true)}>Add a record</StPill> : undefined} />}
      {submitMessage ? <div role="status"><StNotice>{submitMessage}</StNotice></div> : null}
      {formView && formOpen && (snapshot.access.recordSubmit || (editAllowed && editing)) ? (
        <StSurface>
          <StSection title={draft.editingRecordId ? "Correct a record" : viewLabel("form")}>
            <StCopy muted>{draft.editingRecordId ? "Save a correction to the record. If someone changed it first, your correction stays here so you can review it." : "Enter the details below. Keep this tab open if you need to retry."}</StCopy>
          <form ref={formRef} className="space-y-5" onSubmit={submit} aria-busy={busy}>
            <div className="grid gap-5 sm:grid-cols-2">
              {formView.fields.map(field => {
                const value = draft.values[field.id];
                const savedLink = (field.type === "contact" || field.type === "assigned_person") && typeof value === "string" && LINK_ID.test(value);
                const savedLabel = savedLink ? snapshot.records.find(record => record.id === draft.editingRecordId && record.values[field.id] === value)?.linkLabels?.[field.id] : undefined;
                if (field.type === "boolean") {
                  return (
                    <fieldset key={field.id} className="space-y-2">
                      <legend className="block text-xs text-gray-muted">{field.label}{field.required ? " *" : ""}</legend>
                      <div className="flex flex-wrap gap-2">
                        {[true, false].map(option => (
                          <label key={String(option)} className="inline-flex min-h-11 items-center gap-2 text-sm">
                            <input
                              id={`${instanceId}-app-field-${field.id}-${option ? "yes" : "no"}`}
                              name={`${instanceId}-app-field-${field.id}`}
                              type="radio"
                              value={String(option)}
                              checked={value === option}
                              disabled={busy}
                              onChange={() => updateValue(field.id, option)}
                              required={field.required}
                              className="h-4 w-4 accent-sage"
                            />
                            <span>{option ? "Yes" : "No"}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  );
                }
                if (field.type === "select") {
                  return (
                    <StField key={field.id} label={`${field.label}${field.required ? " *" : ""}`}>
                      <select
                        id={`${instanceId}-app-field-${field.id}`}
                        name={`${instanceId}-app-field-${field.id}`}
                        aria-label={field.label}
                        value={value === undefined ? "" : String(value)}
                        required={field.required}
                        disabled={busy}
                        onChange={event => updateValue(field.id, event.target.value)}
                      >
                        <option value="">Choose an option</option>
                        {field.options?.map(option => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </StField>
                  );
                }
                return (
                  <StTextField
                    key={field.id}
                    id={`${instanceId}-app-field-${field.id}`}
                    label={`${field.label}${field.required ? " *" : ""}`}
                    aria-label={field.label}
                    type={fieldInputType(field.type)}
                    placeholder={savedLink ? savedLabel ?? "Current link (unchanged)" : fieldPlaceholder(field.type)}
                    description={savedLink ? `${savedLabel ? `Currently linked: ${savedLabel}.` : field.type === "assigned_person" ? "A staff member is already linked." : "A contact is already linked."} ${field.type === "assigned_person" ? "Enter another staff email to change it." : "Enter another email or phone to change it."}` : undefined}
                    inputMode={field.type === "number" ? "decimal" : undefined}
                    value={savedLink || value === undefined ? "" : String(value)}
                    required={field.required && !savedLink}
                    disabled={busy}
                    onChange={event => updateValue(field.id, field.type === "number" ? (event.target.value === "" ? undefined : Number(event.target.value)) : event.target.value)}
                  />
                );
              })}
            </div>
            {submitError ? <div id={`${instanceId}-application-submit-error`} role="alert"><StNotice tone="critical">{submitError}</StNotice></div> : null}
            <div className="flex flex-wrap items-center gap-3">
              <StPill type="submit" variant={presentation === "preview" ? "soft" : "primary"} busy={busy} disabled={busy} aria-describedby={submitError ? `${instanceId}-application-submit-error` : undefined}>{draft.editingRecordId ? "Save correction" : "Submit record"}</StPill>
              {draft.editingRecordId ? <StPill type="button" variant="soft" disabled={busy} onClick={cancelEdit}>Cancel correction</StPill> : null}
              {onReload && submitError ? <StPill type="button" variant="soft" disabled={busy} onClick={onReload}>Reload internal tool</StPill> : null}
            </div>
          </form>
          </StSection>
        </StSurface>
      ) : null}

      {recordViews.length > 0 && snapshot.access.recordRead !== "none" ? (
        <div className={styles.recordsLayout}>
          <StSection title={recordsHeading} meta={<StMono>{snapshot.records.length}</StMono>}>
            {snapshot.records.length === 0 ? <StEmpty>There are no records to show yet.</StEmpty> : <StRows label={recordsHeading}>
              {snapshot.records.map((record, index) => <StRow key={record.id} selected={selectedRecord?.id === record.id}
                title={record.linkLabels?.[(recordFields[0]?.id ?? "")] ?? displayValue(record.values[(recordFields[0]?.id ?? "")])}
                detail={record.linkLabels?.[(recordSummaryField ?? recordFields[1]?.id ?? "")] ?? displayValue(record.values[(recordSummaryField ?? recordFields[1]?.id ?? "")])}
                onClick={() => setSelectedId(record.id)}><span className="sr-only">Record {index + 1}</span></StRow>)}
            </StRows>}
          </StSection>
          {selectedRecord ? <StSurface>
            <article aria-label={`Record ${snapshot.records.indexOf(selectedRecord) + 1}`}>
              <div className={styles.recordHead}><span>Record details</span>
                {formView && editAllowed && selectedRecord.revision !== undefined ? <StTextButton onClick={() => beginEdit(selectedRecord)}>Edit record</StTextButton> : null}
              </div>
              <dl className={styles.fields}>{recordFields.map(field => <div key={field.id}>
                <dt>{field.label}</dt><dd>{selectedRecord.linkLabels?.[field.id] ?? displayValue(selectedRecord.values[field.id])}</dd>
              </div>)}</dl>
            </article>
          </StSurface> : null}
        </div>
      ) : null}
      {presentation !== "preview" ? <StSection title="Access and checks"><StRows><StRow title="Access expires" value={<StMono as="time" dateTime={snapshot.access.expiresAt}>{new Date(snapshot.access.expiresAt).toLocaleString()}</StMono>} /><StRow title="Latest checks" detail="No check result is available for this tool yet, so Strelva can’t say it’s working." end={<StState kind="draft">Not checked</StState>} /></StRows></StSection> : null}
      {snapshot.access.recordEdit === "none" && !snapshot.access.recordSubmit ? <StNotice>You have read-only access. You can open records; the owner controls changes.</StNotice> : null}
    </Container>
  );
}
