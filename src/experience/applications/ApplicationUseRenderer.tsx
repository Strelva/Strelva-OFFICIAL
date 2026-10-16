"use client";
/**
 * One internal tool, in use (XA, lane xs-apps-care). Story on the left: what
 * the tool is, what you may do in it and its records. The object on the right:
 * the record you opened, or the record you are adding or correcting, in place.
 * Never a modal. One ink pill: "Add a record" while reading, "Submit record"
 * while the form is open.
 */
import { FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  XaAnswers, XaButton, XaDecision, XaField, XaHeadline, XaRow, XaRows, XaStatus, XaSystemTile, XaTextLink,
} from "@/components/ui/strelva/Xa";
import { XaBlock, XaNote, XaObjectPage } from "@/experience/xa-object/XaObjectPage";
import styles from "./application-use.module.css";
import type { ApplicationUseSnapshot } from "@/products/applications/client";

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

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
function displayValue(value: string | number | boolean | undefined): string {
  if (value === undefined || value === "") return "Not given";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" && ISO_DAY.test(value)) return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
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
const dateLabel = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function nextIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ApplicationUseRenderer({
  presentation, recordSummaryField, snapshot, draft, busy = false, submitError, submitMessage, onReload, onDraftChange, onSubmit,
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
  const recordsWord = recordViews.some(view => view.kind !== "document") ? "record" : "document";
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

  const titleField = recordFields[0]?.id ?? "";
  const summaryField = recordSummaryField ?? recordFields[1]?.id ?? "";
  const recordTitle = (record: ApplicationUseSnapshot["records"][number]) => record.linkLabels?.[titleField] ?? displayValue(record.values[titleField]);
  const recordSummary = (record: ApplicationUseSnapshot["records"][number]) => record.linkLabels?.[summaryField] ?? displayValue(record.values[summaryField]);
  const selectedRecord = snapshot.records.find(record => record.id === selectedId) ?? snapshot.records[0];
  const canRead = recordViews.length > 0 && snapshot.access.recordRead !== "none";
  const formOpen = presentation === "preview" || adding || editing || snapshot.records.length === 0 || !canRead || Boolean(submitError);
  const formShown = Boolean(formView && formOpen && (snapshot.access.recordSubmit || (editAllowed && editing)));
  const readOnly = snapshot.access.recordEdit === "none" && !snapshot.access.recordSubmit;

  const form = formView && formShown ? <form ref={formRef} className={styles.form} onSubmit={submit} aria-busy={busy} aria-label={draft.editingRecordId ? "Correct a record" : "Submit a record"}>
    <div className={styles.fields}>
      {formView.fields.map(field => {
        const value = draft.values[field.id];
        const savedLink = (field.type === "contact" || field.type === "assigned_person") && typeof value === "string" && LINK_ID.test(value);
        const savedLabel = savedLink ? snapshot.records.find(record => record.id === draft.editingRecordId && record.values[field.id] === value)?.linkLabels?.[field.id] : undefined;
        const optional = field.required ? undefined : "Optional";
        if (field.type === "boolean") {
          return <fieldset key={field.id} className={styles.choiceField}>
            <legend>{field.label}{optional ? <span className={styles.optional}> · optional</span> : null}</legend>
            <div className={styles.choiceRow}>
              {[true, false].map(option => <label key={String(option)} className={styles.choice}>
                <input id={`${instanceId}-app-field-${field.id}-${option ? "yes" : "no"}`} name={`${instanceId}-app-field-${field.id}`} type="radio" value={String(option)}
                  checked={value === option} disabled={busy} onChange={() => updateValue(field.id, option)} required={field.required} />
                <span>{option ? "Yes" : "No"}</span>
              </label>)}
            </div>
          </fieldset>;
        }
        if (field.type === "select") {
          return <div key={field.id} className={styles.selectField}>
            <label htmlFor={`${instanceId}-app-field-${field.id}`}>{field.label}{optional ? <span className={styles.optional}> · optional</span> : null}</label>
            <select id={`${instanceId}-app-field-${field.id}`} name={`${instanceId}-app-field-${field.id}`} aria-label={field.label} value={value === undefined ? "" : String(value)}
              required={field.required} disabled={busy} onChange={event => updateValue(field.id, event.target.value)}>
              <option value="">Choose one</option>
              {field.options?.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>;
        }
        return <XaField key={field.id} id={`${instanceId}-app-field-${field.id}`} label={field.label} aria-label={field.label}
          type={fieldInputType(field.type)}
          placeholder={savedLink ? savedLabel ?? "Current link (unchanged)" : fieldPlaceholder(field.type)}
          hint={savedLink ? `${savedLabel ? `Currently linked: ${savedLabel}.` : field.type === "assigned_person" ? "A staff member is already linked." : "A contact is already linked."} ${field.type === "assigned_person" ? "Enter another staff email to change it." : "Enter another email or phone to change it."}` : optional}
          inputMode={field.type === "number" ? "decimal" : undefined}
          value={savedLink || value === undefined ? "" : String(value)}
          required={field.required && !savedLink}
          disabled={busy}
          onChange={event => updateValue(field.id, field.type === "number" ? (event.target.value === "" ? undefined : Number(event.target.value)) : event.target.value)} />;
      })}
    </div>
    {submitError ? <div id={`${instanceId}-application-submit-error`} role="alert"><XaNote tone="down">{submitError}</XaNote></div> : null}
    <div className={styles.actions}>
      <XaButton type="submit" variant={presentation === "preview" ? "secondary" : "primary"} size="lg" busy={busy} disabled={busy} aria-describedby={submitError ? `${instanceId}-application-submit-error` : undefined}>{draft.editingRecordId ? "Save correction" : "Submit record"}</XaButton>
      {draft.editingRecordId ? <XaButton type="button" variant="quiet" disabled={busy} onClick={cancelEdit}>Cancel correction</XaButton>
        : adding && snapshot.records.length > 0 && presentation !== "preview" ? <XaButton type="button" variant="quiet" disabled={busy} onClick={() => setAdding(false)}>Not now</XaButton> : null}
      {onReload && submitError ? <XaButton type="button" variant="secondary" disabled={busy} onClick={onReload}>Reload internal tool</XaButton> : null}
    </div>
  </form> : null;

  const records = canRead ? (snapshot.records.length === 0
    ? <XaNote>No {recordsWord}s yet. {formView && snapshot.access.recordSubmit ? `The first one you submit shows here.` : "They show here when someone adds one."}</XaNote>
    : <XaRows label={recordsWord === "record" ? "Records" : "Documents"}>
      {snapshot.records.map((record, index) => <XaRow key={record.id} current={!formShown && selectedRecord?.id === record.id}
        title={<>{recordTitle(record)}<span className="sr-only"> · Record {index + 1}</span></>} detail={recordSummary(record)}
        onClick={() => { setSelectedId(record.id); if (!editing) setAdding(false); }} />)}
    </XaRows>) : null;

  // The draft builder's live preview: the form and records only, one column.
  if (presentation === "preview") {
    return <div className={styles.previewStack}>
      <XaHeadline as="h2" size="sm">{snapshot.title}</XaHeadline>
      {submitMessage ? <XaNote role="status" tone="done">{submitMessage}</XaNote> : null}
      {form}
      {records}
    </div>;
  }

  const detail = selectedRecord && !formShown ? <XaDecision label={`Record ${snapshot.records.indexOf(selectedRecord) + 1}`}
    status={<span className={styles.recordStatus}>{recordTitle(selectedRecord)}</span>}
    meta={formView && editAllowed && selectedRecord.revision !== undefined ? <XaTextLink onClick={() => beginEdit(selectedRecord)}>Edit record</XaTextLink> : undefined}
    yes={null}>
    <article aria-label={`Record ${snapshot.records.indexOf(selectedRecord) + 1}`}>
      <dl className={styles.recordFields}>{recordFields.map(field => <div key={field.id}>
        <dt>{field.label}</dt><dd>{selectedRecord.linkLabels?.[field.id] ?? displayValue(selectedRecord.values[field.id])}</dd>
      </div>)}</dl>
    </article>
  </XaDecision> : null;

  const object = formShown ? <XaDecision label={draft.editingRecordId ? "Correct a record" : "Submit a record"}
    status={<span className={styles.recordStatus}>{draft.editingRecordId ? "Correcting a record" : "New record"}</span>}
    meta={draft.editingRecordId ? "If someone changed it first, your correction stays here." : "Keep this tab open if you need to try again."} yes={null}>
    {form}
  </XaDecision> : detail;

  const count = snapshot.records.length;
  return <XaObjectPage label={snapshot.title}
    story={<>
      <XaSystemTile kind="form" size={56} label="Internal tool" />
      <XaHeadline quiet={!canRead ? "Fill it in. Your answers go to the business." : count ? `${plural(count, recordsWord, `${recordsWord}s`)}. Open one, or add one.` : `No ${recordsWord}s yet.`}>{snapshot.title}.</XaHeadline>
      {submitMessage ? <XaNote role="status" tone="done">{submitMessage}</XaNote> : null}
      {formView && snapshot.access.recordSubmit && !formShown ? <div><XaButton variant="primary" size="lg" onClick={() => setAdding(true)}>Add a record</XaButton></div> : null}
      <XaAnswers labelWidth={120} rows={[
        ["Release", `Release ${snapshot.releaseVersion}`],
        ["You can", readOnly ? "Read records. The owner controls changes." : snapshot.access.recordEdit === "all" ? "Add records and correct any record." : snapshot.access.recordEdit === "own" ? "Add records and correct your own." : "Add records."],
        ["Your access", <time key="t" dateTime={snapshot.access.expiresAt}>Until {dateLabel(snapshot.access.expiresAt)}</time>],
        ["Checks", <span key="c" className={styles.checks}><XaStatus kind="draft" size="sm">Not checked</XaStatus><span>No check has run yet, so Strelva can&apos;t say it&apos;s working.</span></span>],
      ]} />
      {canRead ? <XaBlock label={recordsWord === "record" ? "Records" : "Documents"} id={`${instanceId}-records`}>{records}</XaBlock> : null}
      {readOnly ? <XaNote>You have read-only access. You can open records; the owner controls changes.</XaNote> : null}
    </>}
    object={object} />;
}
