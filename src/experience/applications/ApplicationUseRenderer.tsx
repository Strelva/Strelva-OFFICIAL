"use client";

import { FormEvent, useId, useMemo } from "react";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
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

function fieldInputType(type: "text" | "number" | "boolean" | "date"): "text" | "number" | "date" {
  if (type === "number") return "number";
  if (type === "date") return "date";
  return "text";
}

function nextIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ApplicationUseRenderer({
  presentation,
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
  const formView = snapshot.views.find(view => view.kind === "form");
  const editAllowed = snapshot.access.recordEdit === "own" || snapshot.access.recordEdit === "all";
  const editing = draft.editingRecordId !== undefined;
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
    onDraftChange({ values: {}, recordId: nextIdempotencyKey(), idempotencyKey: nextIdempotencyKey() });
  }

  return (
    <div className={presentation === "preview" ? "flex min-w-0 flex-col gap-6 p-4 sm:p-6" : "mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12 lg:px-8"}>
      <header className="max-w-3xl space-y-3">
        {presentation === "preview" ? <h3 className="text-xl font-medium text-warm-black">{snapshot.title}</h3> : <h1 className="font-display text-3xl font-medium leading-tight text-warm-black sm:text-4xl">{snapshot.title}</h1>}
      </header>

      {submitMessage ? <p role="status" className="rounded-lg border border-sage/30 bg-sage/5 px-3 py-2 text-sm text-sage-dark">{submitMessage}</p> : null}

      {formView && (snapshot.access.recordSubmit || (editAllowed && editing)) ? (
        <section aria-labelledby={`${instanceId}-application-form-heading`} className="rounded-2xl border border-gray-border bg-surface p-5 shadow-sm sm:p-7">
          <div className="mb-6 space-y-2">
            <h2 id={`${instanceId}-application-form-heading`} className="font-display text-2xl font-medium text-warm-black">{draft.editingRecordId ? "Correct a record" : viewLabel("form")}</h2>
            <p className="text-sm leading-6 text-gray-fg">{draft.editingRecordId ? "Save a correction to the record. If someone changed it first, your correction stays here so you can review it." : "Enter the details below. Keep this tab open if you need to retry."}</p>
          </div>
          <form className="space-y-5" onSubmit={submit} aria-busy={busy}>
            <div className="grid gap-5 sm:grid-cols-2">
              {formView.fields.map(field => {
                const value = draft.values[field.id];
                if (field.type === "boolean") {
                  return (
                    <fieldset key={field.id} className="space-y-2">
                      <legend className="block text-xs text-gray-muted">{field.label}{field.required ? " *" : ""}</legend>
                      <div className="flex flex-wrap gap-2">
                        {[true, false].map(option => (
                          <label key={String(option)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-gray-border px-3.5 py-2 text-sm text-warm-black">
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
                    <label key={field.id} className="block text-sm text-warm-black">
                      <span className="block text-xs text-gray-muted">{field.label}{field.required ? " *" : ""}</span>
                      <select
                        id={`${instanceId}-app-field-${field.id}`}
                        name={`${instanceId}-app-field-${field.id}`}
                        className="mt-1 block min-h-11 w-full rounded-xl border border-gray-border bg-surface px-3 py-2 text-sm"
                        aria-label={field.label}
                        value={value === undefined ? "" : String(value)}
                        required={field.required}
                        disabled={busy}
                        onChange={event => updateValue(field.id, event.target.value)}
                      >
                        <option value="">Choose an option</option>
                        {field.options?.map(option => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </label>
                  );
                }
                return (
                  <TextInput
                    key={field.id}
                    id={`${instanceId}-app-field-${field.id}`}
                    label={`${field.label}${field.required ? " *" : ""}`}
                    aria-label={field.label}
                    type={fieldInputType(field.type)}
                    inputMode={field.type === "number" ? "decimal" : undefined}
                    value={value === undefined ? "" : String(value)}
                    required={field.required}
                    disabled={busy}
                    onChange={event => updateValue(field.id, field.type === "number" ? (event.target.value === "" ? undefined : Number(event.target.value)) : event.target.value)}
                  />
                );
              })}
            </div>
            {submitError ? <p id={`${instanceId}-application-submit-error`} role="alert" className="rounded-lg border border-terra/30 bg-terra/5 px-3 py-2 text-sm text-terra">{submitError}</p> : null}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" loading={busy} disabled={busy} aria-describedby={submitError ? `${instanceId}-application-submit-error` : undefined}>{draft.editingRecordId ? "Save correction" : "Submit record"}</Button>
              {draft.editingRecordId ? <Button type="button" variant="secondary" disabled={busy} onClick={cancelEdit}>Cancel correction</Button> : null}
              {onReload && submitError ? <Button type="button" variant="secondary" disabled={busy} onClick={onReload}>Reload application</Button> : null}
            </div>
          </form>
        </section>
      ) : null}

      {recordViews.length > 0 && snapshot.access.recordRead !== "none" ? (
        <section aria-labelledby={`${instanceId}-application-records-heading`} className="space-y-4">
          <div className="space-y-2">
            <h2 id={`${instanceId}-application-records-heading`} className="font-display text-2xl font-medium text-warm-black">{recordsHeading}</h2>
          </div>
          {snapshot.records.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-gray-border bg-surface-inset px-5 py-8 text-sm text-gray-muted">There are no records to show yet.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {snapshot.records.map((record, index) => (
                <article key={record.id} aria-label={`Record ${index + 1}`} className="rounded-2xl border border-gray-border bg-surface p-5 shadow-sm">
                  <h3 className="mb-4 text-sm font-medium text-warm-black">Record {index + 1}</h3>
                  <dl className="grid gap-3 sm:grid-cols-2">
                    {recordFields.map(field => (
                      <div key={field.id} className="min-w-0">
                        <dt className="text-xs uppercase tracking-[0.1em] text-gray-muted">{field.label}</dt>
                        <dd className="mt-1 break-words text-sm text-warm-black">{displayValue(record.values[field.id])}</dd>
                      </div>
                    ))}
                  </dl>
                  {formView && editAllowed && record.revision !== undefined ? <Button type="button" variant="secondary" className="mt-5" onClick={() => beginEdit(record)}>Edit record</Button> : null}
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
