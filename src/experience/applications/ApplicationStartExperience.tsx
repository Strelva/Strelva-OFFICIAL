"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";
import { TextInput, SelectInput } from "@/components/ui/TextInput";
import { applicationSchema, applicationSpecSchema, type ApplicationSpec } from "@/products/applications/contracts";
import { APPLICATION_TEMPLATES, applicationTemplateSpec, type ApplicationTemplateSpec } from "@/products/applications/templates";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";
import type { WorkspaceWork } from "@/experience/workspace/contracts";
import { ApplicationDraftPreview } from "./ApplicationDraftPreview";
import styles from "./application-builder.module.css";

type Field = ApplicationSpec["fields"][number];
const FIELD_TYPES: Array<{ value: Field["type"]; label: string }> = [{ value: "text", label: "Text" }, { value: "number", label: "Number" }, { value: "date", label: "Date" }, { value: "select", label: "Choose one" }, { value: "boolean", label: "Yes or no" }];
function blank(): ApplicationTemplateSpec {
  return { title: "", fields: [{ id: "name", label: "Name", type: "text", required: true }, { id: "notes", label: "Notes", type: "text", required: false }], components: [{ kind: "form", fields: ["name", "notes"] }, { kind: "list", fields: ["name", "notes"] }, { kind: "detail", fields: ["name", "notes"] }] };
}
function withFields(spec: ApplicationTemplateSpec, fields: Field[]): ApplicationTemplateSpec {
  return { ...spec, fields, components: spec.components.map(component => ({ ...component, fields: fields.map(field => field.id) })) };
}
function errorText(body: unknown, fallback: string): string {
  return body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : fallback;
}

export function ApplicationStartExperience({ workspaceId, initialTemplateId, initialRequest, sources, onSaved }: {
  workspaceId: string;
  initialTemplateId?: string;
  initialRequest?: string;
  sources: readonly WorkspaceWork[];
  onSaved: (id: string) => void;
}) {
  const transport = useWorkspaceRequest();
  const [templateId, setTemplateId] = useState(initialTemplateId || "blank");
  const [spec, setSpec] = useState<ApplicationTemplateSpec>(() => applicationTemplateSpec(initialTemplateId) || blank());
  const [pendingTemplate, setPendingTemplate] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [copySource, setCopySource] = useState("");
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");
  const active = useRef(true);
  const writing = useRef(false);
  const fieldSequence = useRef(0);
  const fieldList = useRef<HTMLDivElement>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const disabled = busy || uncertain || Boolean(savedId);
  const copies = sources.filter(source => source.productId === "applications" && !source.unavailableReason);
  const previewSpec = { ...spec, title: spec.title || "Your application" };

  function change(next: ApplicationTemplateSpec) { setSpec(next); setDirty(true); setError(""); }
  function applyTemplate(id: string) { setTemplateId(id); setSpec(applicationTemplateSpec(id) || blank()); setPendingTemplate(null); setDirty(false); setError(""); }
  function selectTemplate(id: string) { if (disabled) return; if (dirty) setPendingTemplate(id); else applyTemplate(id); }
  function updateField(id: string, field: Field) { change(withFields(spec, spec.fields.map(item => item.id === id ? field : item))); }
  function changeType(field: Field, type: Field["type"]) {
    const common = { id: field.id, label: field.label, required: field.required };
    updateField(field.id, type === "select" ? { ...common, type, options: field.type === "select" ? field.options : ["Option 1", "Option 2"] } : { ...common, type });
  }
  function addField() {
    if (disabled || spec.fields.length >= 30) return;
    let id: string;
    do { fieldSequence.current += 1; id = `field_${fieldSequence.current}`; } while (spec.fields.some(field => field.id === id));
    change(withFields(spec, [...spec.fields, { id, label: "", type: "text", required: false }]));
    window.requestAnimationFrame(() => fieldList.current?.querySelector<HTMLInputElement>(`[data-field-id="${id}"] input`)?.focus());
  }
  async function create(command: Record<string, unknown>) {
    if (disabled || writing.current) return;
    writing.current = true; setBusy(true); setError("");
    let outcomeUnknown = true;
    try {
      const response = await transport("/api/bounded-work", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ productId: "applications", workspaceId, ...command }) });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        outcomeUnknown = response.status >= 500 || response.status === 408;
        throw new Error(errorText(body, "Your application could not be created."));
      }
      if (!body || typeof body !== "object" || !("id" in body) || typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id) || !("payload" in body) || !applicationSchema.safeParse(body.payload).success) throw new Error("The save returned an unconfirmed result.");
      outcomeUnknown = false;
      if (!active.current) return;
      setSavedId(body.id);
      onSaved(body.id);
    } catch (cause) {
      if (!active.current) return;
      setUncertain(outcomeUnknown);
      setError(`${cause instanceof Error ? cause.message : "The save could not be confirmed."}${outcomeUnknown ? " Check your saved work before creating another app. Your draft remains here." : " Your draft remains here."}`);
    } finally { writing.current = false; if (active.current) setBusy(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = applicationSpecSchema.safeParse({ ...spec, maintenanceOwner: "assigned-by-server" });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || "Check the application fields."); return; }
    void create({ action: "create", input: spec });
  }
  const workHref = `/workspace?workspaceId=${encodeURIComponent(workspaceId)}&view=work`;
  return <section className={styles.page} data-application-builder aria-busy={busy}>
    <header className={styles.header}><div><p className={styles.eyebrow}>New application</p><h1>Build it. Try it. Make it yours.</h1><p>Start from a template or your own fields. Your app stays private until you publish and share it.</p></div></header>
    {initialRequest ? <details className={styles.request} open><summary>Your original request</summary><p>{initialRequest}</p></details> : null}
    {savedId ? <p role="status" className={styles.notice}>Your draft is saved. <a href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}&view=applications&work=${encodeURIComponent(savedId)}`}>Open the saved application</a></p> : null}
    {error ? <div className={styles.notice} role="alert"><p>{error}</p>{uncertain ? <a href={workHref}>Check saved work</a> : null}</div> : null}
    <div className={styles.mobileTabs} role="group" aria-label="Application builder view"><Button type="button" variant={mobileView === "edit" ? "secondary" : "ghost"} aria-pressed={mobileView === "edit"} onClick={() => setMobileView("edit")}>Edit</Button><Button type="button" variant={mobileView === "preview" ? "secondary" : "ghost"} aria-pressed={mobileView === "preview"} onClick={() => setMobileView("preview")}>Preview</Button></div>
    <div className={styles.columns} data-mobile-view={mobileView}>
      <div className={styles.editor}>
        <SelectInput label="Starting template" value={templateId} disabled={disabled} onChange={event => selectTemplate(event.target.value)} options={[{ value: "blank", label: "Start from scratch" }, ...APPLICATION_TEMPLATES.map(entry => ({ value: entry.id, label: entry.name }))]} />
        {pendingTemplate ? <div role="status" className={styles.notice}><p>Replace your current draft with this template? Your unsaved field changes will be removed.</p><div className={styles.actions}><Button type="button" variant="secondary" onClick={() => applyTemplate(pendingTemplate)}>Replace draft</Button><Button type="button" variant="ghost" onClick={() => setPendingTemplate(null)}>Keep my changes</Button></div></div> : null}
        <form onSubmit={submit} className={styles.form}>
          <TextInput label="Application name" value={spec.title} placeholder="For example, Staff requests" maxLength={160} required disabled={disabled} onChange={event => change({ ...spec, title: event.target.value })} />
          <div className={styles.sectionHeading}><h2>Information to collect</h2><span>{spec.fields.length} / 30 fields</span></div>
          <div ref={fieldList} className={styles.fields}>{spec.fields.map((field, index) => <fieldset key={field.id} data-field-id={field.id} className={styles.field} disabled={disabled}><legend className="sr-only">Field {index + 1}</legend>
            <div className={styles.fieldTop}><TextInput label={`Field ${index + 1}`} value={field.label} maxLength={80} required onChange={event => updateField(field.id, { ...field, label: event.target.value })} /><IconButton type="button" label={`Remove ${field.label || `field ${index + 1}`}`} disabled={disabled || spec.fields.length <= 1} onClick={() => change(withFields(spec, spec.fields.filter(item => item.id !== field.id)))}><Trash2 size={16} /></IconButton></div>
            <div className={styles.fieldOptions}><SelectInput label="Type" value={field.type} options={FIELD_TYPES} onChange={event => changeType(field, event.target.value as Field["type"])} /><label className={styles.required}><input type="checkbox" checked={field.required} onChange={event => updateField(field.id, { ...field, required: event.target.checked })} />Required</label></div>
            {field.type === "select" ? <div className={styles.options}>{field.options.map((option, optionIndex) => <div className={styles.fieldTop} key={`${field.id}-${optionIndex}`}><TextInput label={`Option ${optionIndex + 1} for ${field.label}`} value={option} maxLength={80} required onChange={event => updateField(field.id, { ...field, options: field.options.map((item, i) => i === optionIndex ? event.target.value : item) })} /><IconButton type="button" label={`Remove option ${optionIndex + 1} for ${field.label}`} disabled={disabled || field.options.length <= 1} onClick={() => updateField(field.id, { ...field, options: field.options.filter((_, i) => i !== optionIndex) })}><Trash2 size={16} /></IconButton></div>)}<Button type="button" variant="ghost" size="sm" disabled={field.options.length >= 20} onClick={() => updateField(field.id, { ...field, options: [...field.options, `Option ${field.options.length + 1}`] })}>Add option</Button></div> : null}
          </fieldset>)}</div>
          <Button type="button" variant="secondary" disabled={disabled || spec.fields.length >= 30} onClick={addField} icon={<Plus size={16} />}>Add a field</Button>
          <div className={styles.save}><Button type="submit" loading={busy} disabled={disabled || !spec.title.trim()}>Create application <ArrowRight size={16} /></Button><p>Creates a private draft with a form and record views. Publishing and access are separate decisions.</p></div>
        </form>
        {copies.length ? <details className={styles.copy}><summary>Or copy an existing app</summary><p>Start a separate draft from an app you can access. Its records and access are not copied.</p><SelectInput label="Application to copy" value={copySource} disabled={disabled} options={[{ value: "", label: "Choose an application" }, ...copies.map(source => ({ value: source.id, label: source.title }))]} onChange={event => setCopySource(event.target.value)} /><Button type="button" variant="secondary" disabled={disabled || !copySource} onClick={() => void create({ action: "from_source", sourceWorkId: copySource })}>Copy application</Button></details> : null}
      </div>
      <div className={styles.preview}><ApplicationDraftPreview spec={previewSpec} /></div>
    </div>
  </section>;
}
