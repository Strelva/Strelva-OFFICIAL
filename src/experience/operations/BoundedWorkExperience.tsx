"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { z } from "zod";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { ApplicationAccessControls } from "@/experience/applications/ApplicationAccessControls";
import { applicationSchema, type applicationSpecSchema } from "@/products/applications/contracts";
import { scheduleSchema } from "@/products/scheduling/contracts";
import { investigationSchema } from "@/products/investigations/contracts";
import type { WorkspaceWork } from "@/experience/workspace/contracts";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";

type Product = "applications" | "scheduling" | "investigations";
type Application = z.infer<typeof applicationSchema>;
type Schedule = z.infer<typeof scheduleSchema>;
type Investigation = z.infer<typeof investigationSchema>;
type Spec = z.infer<typeof applicationSpecSchema>;
type Saved = { id: string; payload: Application | Schedule | Investigation };
type Props = { initialRequest?: string; workspaceId: string; workId?: string; productId: Product; readOnly?: boolean; sources: WorkspaceWork[]; onSaved: (id: string) => void };
type Command = (command: Record<string, unknown>, action?: "command" | "run") => Promise<boolean>;
const labels = { applications: "Private application", scheduling: "Reservations", investigations: "Source comparison" };
const control = "block w-full rounded-xl border border-gray-border bg-surface px-3 py-2 text-sm min-h-11";
const group = "space-y-4 border-t border-gray-border pt-5";
const defaultSelectOptions = ["Option 1", "Option 2"];

function fieldWithType(field: Spec["fields"][number], type: Spec["fields"][number]["type"]): Spec["fields"][number] {
  const base = { id: field.id, label: field.label, required: field.required };
  if (type === "select") {
    return { ...base, type, options: field.type === "select" ? field.options : [...defaultSelectOptions] };
  }
  return { ...base, type };
}

function SelectOptionsEditor({
  field,
  disabled,
  onChange,
}: {
  field: Extract<Spec["fields"][number], { type: "select" }>;
  disabled: boolean;
  onChange: (options: string[]) => void;
}) {
  return <div className="space-y-3 sm:col-span-3">
    <p className="text-sm font-medium">Allowed options</p>
    <div className="space-y-3">
      {field.options.map((option, index) => <div key={`${field.id}-option-${index}`} className="flex items-end gap-3">
        <TextInput label={`Option ${index + 1} for ${field.label}`} value={option} maxLength={80} required disabled={disabled} onChange={event => onChange(field.options.map((item, optionIndex) => optionIndex === index ? event.target.value : item))} />
        <Button type="button" variant="secondary" disabled={disabled || field.options.length <= 1} onClick={() => onChange(field.options.filter((_, optionIndex) => optionIndex !== index))}>Remove<span className="sr-only"> option {index + 1}</span></Button>
      </div>)}
    </div>
    <Button type="button" variant="secondary" disabled={disabled || field.options.length >= 20} onClick={() => onChange([...field.options, `Option ${field.options.length + 1}`])}>Add option</Button>
    <p className="text-xs text-gray-muted">People can choose one of these options. Keep an option in place while records use it; publishing checks existing records before changing the list.</p>
  </div>;
}

async function response(response: Response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "This work could not be saved. Your inputs remain here.");
  return body;
}
function decode(product: Product, body: { id: string; payload: unknown }): Saved {
  if (!body.id) throw new Error("The saved result did not include its identity. Reload before continuing.");
  const parsed = product === "applications" ? applicationSchema.safeParse(body.payload) : product === "scheduling" ? scheduleSchema.safeParse(body.payload) : investigationSchema.safeParse(body.payload);
  if (!parsed.success) throw new Error("This saved work uses a version this interface cannot display. No further change was attempted.");
  return { id: body.id, payload: parsed.data };
}
function time(value: string) { return new Date(value).toLocaleString(); }
function iso(value: string) { const date = new Date(value); if (Number.isNaN(date.getTime())) throw new Error("Choose a valid start and end time."); return date.toISOString(); }
function localDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function BoundedWorkExperience(props: Props) {
  return <Session key={`${props.workspaceId}:${props.workId ?? "new"}:${props.productId}`} {...props} />;
}
function Session({ initialRequest, workspaceId, workId, productId, readOnly = false, sources, onSaved }: Props) {
  const request = useWorkspaceRequest();
  const [saved, setSaved] = useState<Saved | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    if (!workId) return;
    const controller = new AbortController();
    setBusy(true); setError("");
    request(`/api/bounded-work?productId=${productId}&workId=${encodeURIComponent(workId)}`, { signal: controller.signal, cache: "no-store" }).then(response).then(body => { if (!controller.signal.aborted) setSaved(decode(productId, body)); }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "This work could not be loaded."); }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [productId, request, workId, reload]);
  async function write(body: Record<string, unknown>) {
    if (readOnly || busy) return false;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = decode(productId, await response(await request("/api/bounded-work", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId, ...body }) })));
      if (!active.current) return false;
      setSaved(result); setNotice("Saved in this workspace.");
      if (!workId) onSaved(result.id);
      return true;
    } catch (cause) { if (active.current) setError(cause instanceof Error ? cause.message : "This change could not be confirmed. Reload before trying a different change."); return false; }
    finally { if (active.current) setBusy(false); }
  }
  const command: Command = (input, action = "command") => {
    if (!saved) return Promise.resolve(false);
    // Lifecycle calls bind to their own candidate/release clocks. Keep the
    // legacy aggregate clock on older dashboard commands for compatibility.
    const explicitLifecycle = "expectedCandidateRevision" in input || "expectedDesignRevision" in input || ("expectedReleaseVersion" in input && "expectedRecordsRevision" in input);
    return write({ action, workId: saved.id, command: explicitLifecycle ? input : { expectedRevision: saved.payload.revision, ...input } });
  };
  const disabled = readOnly || busy;
  const displayTitle = saved && productId === "applications"
    ? ((saved.payload as Application).status !== "retired" && (saved.payload as Application).release?.spec.title) || saved.payload.title
    : saved?.payload.title;
  return <section className="mx-auto max-w-4xl space-y-6 p-4 sm:p-8" aria-busy={busy}>
    <header><p className="text-sm text-gray-muted">{labels[productId]}</p><h1 className="font-display text-3xl">{displayTitle || (productId === "applications" ? "Make a place for your team’s work" : productId === "scheduling" ? "Keep a time available" : "Keep two sources in agreement")}</h1></header>
    {initialRequest && !saved ? <details className="text-sm"><summary className="cursor-pointer">Your original request</summary><p className="mt-3 whitespace-pre-wrap">{initialRequest}</p></details> : null}
    {readOnly ? <p role="status" className="text-sm text-gray-muted">You can inspect this work. Changes require workspace membership.</p> : null}
    {error ? <div role="alert" className="space-y-2 text-sm text-critical"><p>{error}</p>{workId ? <Button variant="secondary" disabled={busy} onClick={() => setReload(value => value + 1)}>Reload current work</Button> : null}</div> : null}
    {notice ? <p role="status" className="text-sm">{notice}</p> : null}
    {workId && !saved ? <p role="status">{busy ? "Loading your work…" : "No result is available to display."}</p> : saved ? <>
      {productId === "applications" ? <ApplicationResult value={saved.payload as Application} workId={saved.id} canManage={!readOnly} disabled={disabled} command={command} /> : productId === "scheduling" ? <ScheduleResult value={saved.payload as Schedule} disabled={disabled} command={command} /> : <InvestigationResult value={saved.payload as Investigation} disabled={disabled} command={command} sources={sources} workspaceId={workspaceId} />}
      <details className={group}><summary className="cursor-pointer text-sm">History and responsibility</summary><p className="text-sm text-gray-muted">Revision {saved.payload.revision}. Created {time(saved.payload.createdAt)}.</p>{productId === "applications" ? <p className="break-all text-sm">Maintenance owner: {(saved.payload as Application).spec.maintenanceOwner}</p> : null}<ol className="space-y-2 text-sm">{saved.payload.history.slice().reverse().map(item => <li key={item.revision}>{item.kind.replaceAll("_", " ")} · {time(item.at)}<span className="block break-all text-gray-muted">Recorded actor: {item.actorId}</span></li>)}</ol></details>
    </> : !readOnly ? <>{productId === "applications" ? <CopyApplication sources={sources} disabled={disabled} copy={sourceWorkId => write({ action: "from_source", workspaceId, sourceWorkId })} /> : null}<Create productId={productId} sources={sources} disabled={disabled} create={input => write({ action: "create", workspaceId, input })} /></> : null}
  </section>;
}

type CreateProps = { productId: Product; sources: WorkspaceWork[]; disabled: boolean; create: (input: Record<string, unknown>) => Promise<boolean> };
function Create({ productId, sources, disabled, create }: CreateProps) {
  const [title, setTitle] = useState("");
  const [start, setStart] = useState(""); const [end, setEnd] = useState("");
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Spec["fields"]>([{ id: "name", label: "Name", type: "text", required: true }, { id: "notes", label: "Notes", type: "text", required: false }]);
  const [kinds, setKinds] = useState<Spec["components"][number]["kind"][]>(["form", "list", "detail"]);
  const [left, setLeft] = useState<SourceChoice>({ workId: "" }); const [right, setRight] = useState<SourceChoice>({ workId: "" });
  const [interval, setInterval] = useState("60");
  function updateField(index: number, update: Partial<Spec["fields"][number]>) {
    setFields(values => values.map((value, fieldIndex) => fieldIndex === index ? { ...value, ...update } as Spec["fields"][number] : value));
  }
  function updateFieldType(index: number, type: Spec["fields"][number]["type"]) {
    setFields(values => values.map((value, fieldIndex) => fieldIndex === index ? fieldWithType(value, type) : value));
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    try {
      const input = productId === "applications" ? { title, fields, components: kinds.map(kind => ({ kind, fields: fields.map(field => field.id) })) } : productId === "scheduling" ? { title, availability: [{ start: iso(start), end: iso(end) }] } : { title, intervalMinutes: Number(interval), sources: [left, right] };
      await create(input);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Check the details."); }
  }
  return <form onSubmit={event => void submit(event)} className="space-y-5">
    <TextInput label="Name" value={title} onChange={event => setTitle(event.target.value)} maxLength={160} required disabled={disabled} />
    {productId === "applications" ? <><p className="text-sm text-gray-muted">A private workspace app using fixed forms and record views. You will maintain it. It becomes available to workspace members after its checks pass.</p><fieldset className={group}><legend className="font-medium">Information to collect</legend><div className="space-y-4">{fields.map((field, index) => <div key={field.id} className="grid gap-3 rounded-lg border border-gray-border p-3 sm:grid-cols-[1fr_150px_auto]"><TextInput label={`Field ${index + 1}`} value={field.label} maxLength={80} required disabled={disabled} onChange={event => updateField(index, { label: event.target.value })} /><label className="text-sm">Type<select className={control} value={field.type} disabled={disabled} onChange={event => updateFieldType(index, event.target.value as Spec["fields"][number]["type"])}><option value="text">Text</option><option value="number">Number</option><option value="boolean">Yes or no</option><option value="select">Choose one</option></select></label><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={field.required} disabled={disabled} onChange={event => updateField(index, { required: event.target.checked })} />Required</label>{field.type === "select" ? <SelectOptionsEditor field={field} disabled={disabled} onChange={options => updateField(index, { options })} /> : null}</div>)}</div><Button type="button" variant="secondary" disabled={disabled || fields.length >= 30} onClick={() => setFields(values => [...values, { id: `field_${values.length + 1}`, label: "", type: "text", required: false }])}>Add a field</Button></fieldset><fieldset className={group}><legend className="font-medium">What people can use</legend>{(["form", "list", "detail", "document"] as const).map(kind => <label key={kind} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={kinds.includes(kind)} disabled={disabled} onChange={event => setKinds(values => event.target.checked ? [...values, kind] : values.filter(value => value !== kind))} />{kind === "form" ? "Enter a record" : kind === "list" ? "Browse records" : kind === "detail" ? "Inspect a record" : "Read a record as a document"}</label>)}</fieldset></> : productId === "scheduling" ? <><p className="text-sm text-gray-muted">Reserve time inside this workspace. This schedule is not connected to an external calendar. Times use your device’s timezone.</p><TimeFields start={start} end={end} setStart={setStart} setEnd={setEnd} disabled={disabled} /></> : <><p className="text-sm text-gray-muted">Compare two saved sources in this workspace. Each check records the exact source versions. Automatic checks require background execution to be enabled. You can run a due check here.</p><SourcePicker label="First source" value={left} onChange={setLeft} sources={sources} excludedId={right.workId} disabled={disabled} /><SourcePicker label="Second source" value={right} onChange={setRight} sources={sources} excludedId={left.workId} disabled={disabled} /><TextInput label="Minimum minutes between checks" type="number" min={15} max={43200} value={interval} onChange={event => setInterval(event.target.value)} required disabled={disabled} /></>}
    {error ? <p role="alert" className="text-sm text-critical">{error}</p> : null}
    <Button type="submit" disabled={disabled || !title.trim() || (productId === "applications" && !kinds.length) || (productId === "investigations" && (!left.workId || !right.workId))}>{disabled ? "Saving…" : productId === "applications" ? "Create private app" : productId === "scheduling" ? "Save availability" : "Create comparison"}</Button>
  </form>;
}
function TimeFields({ start, end, setStart, setEnd, disabled, labelPrefix = "" }: { start: string; end: string; setStart: (value: string) => void; setEnd: (value: string) => void; disabled: boolean; labelPrefix?: string }) {
  return <div className="grid gap-4 sm:grid-cols-2"><TextInput label={`${labelPrefix}Starts`} type="datetime-local" value={start} onChange={event => setStart(event.target.value)} required disabled={disabled} /><TextInput label={`${labelPrefix}Ends`} type="datetime-local" value={end} onChange={event => setEnd(event.target.value)} required disabled={disabled} /></div>;
}

type SourceChoice = { workId: string; keyField?: string; valueField?: string };
function SourcePicker({ label, value, onChange, sources, excludedId, disabled }: { label: string; value: SourceChoice; onChange: (value: SourceChoice) => void; sources: WorkspaceWork[]; excludedId: string; disabled: boolean }) {
  const id = useId();
  const [fields, setFields] = useState<Array<{ id: string; label: string }>>([]);
  const [error, setError] = useState("");
  const selected = sources.find(source => source.id === value.workId);
  useEffect(() => {
    if (!selected || selected.productId === "documents") return;
    const controller = new AbortController();
    const url = selected.productId === "tracker" ? `/api/tracker?workId=${encodeURIComponent(selected.id)}` : `/api/bounded-work?productId=applications&workId=${encodeURIComponent(selected.id)}`;
    fetch(url, { signal: controller.signal, cache: "no-store" }).then(response).then(body => {
      const available = selected.productId === "tracker" ? (body.tracker.columns as Array<{ fieldKey: string; label: string }>).map(field => ({ id: field.fieldKey, label: field.label })) : applicationSchema.parse(body.payload).spec.fields.map(field => ({ id: field.id, label: field.label }));
      if (!controller.signal.aborted) setFields(available);
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Source fields could not be loaded."); });
    return () => controller.abort();
  }, [selected]);
  const available = sources.filter(source => ["documents", "tracker", "applications"].includes(source.productId) && !source.unavailableReason);
  return <fieldset className={group}><legend className="font-medium">{label}</legend><label className="text-sm" htmlFor={id}>Saved work<select id={id} className={control} value={value.workId} required disabled={disabled} onChange={event => { setFields([]); setError(""); onChange({ workId: event.target.value }); }}><option value="">Choose a saved source</option>{available.map(source => <option key={source.id} value={source.id} disabled={source.id === excludedId}>{source.title}</option>)}</select></label>{!available.length ? <p className="text-sm text-gray-muted">Save two documents, trackers, or applications before creating a comparison.</p> : null}{selected?.productId === "documents" ? <p className="text-sm text-gray-muted">Compares this document’s full text.</p> : selected ? <div className="grid gap-4 sm:grid-cols-2">{(["keyField", "valueField"] as const).map(key => <label key={key} className="text-sm">{key === "keyField" ? "Match records by" : "Compare this field"}<select className={control} value={value[key] || ""} required disabled={disabled || !fields.length} onChange={event => onChange({ ...value, [key]: event.target.value })}><option value="">Choose a field</option>{fields.map(field => <option key={field.id} value={field.id}>{field.label}</option>)}</select></label>)}</div> : null}{error ? <p role="alert" className="text-sm text-critical">{error}</p> : null}</fieldset>;
}
type ApplicationChangeGroup = { heading: string; items: string[] };

function fieldDescription(field: Spec["fields"][number]): string {
  const options = field.type === "select" ? `: ${field.options.join(", ")}` : "";
  return `"${field.label}" (${field.type}${options}, ${field.required ? "required" : "optional"})`;
}

function viewDescription(spec: Spec, component: Spec["components"][number], label: string = component.kind): string {
  const fields = component.fields
    .map(fieldId => spec.fields.find(field => field.id === fieldId)?.label)
    .filter((label): label is string => Boolean(label));
  return `${label} showing ${fields.length ? fields.map(label => `"${label}"`).join(", ") : "no fields"}`;
}

function viewName(kind: Spec["components"][number]["kind"], occurrence: number, total: number): string {
  return total > 1 ? `${kind} ${occurrence + 1}` : kind;
}

function applicationChangeGroups(current: Spec | null, proposed: Spec): ApplicationChangeGroup[] {
  if (!current) {
    const forms = proposed.components.filter(component => component.kind === "form");
    return [
      { heading: "Title", items: [`Title set to "${proposed.title}".`] },
      { heading: "Fields", items: proposed.fields.map(field => `Field added: ${fieldDescription(field)}.`) },
      { heading: "Views", items: proposed.components.map(component => `View added: ${viewDescription(proposed, component)}.`) },
      { heading: "Behavior", items: [forms.length ? "Record entry added." : "No record-entry behavior change."] },
    ];
  }

  const fieldItems: string[] = [];
  for (const proposedField of proposed.fields) {
    const currentField = current.fields.find(field => field.id === proposedField.id);
    if (!currentField) {
      fieldItems.push(`Field added: ${fieldDescription(proposedField)}.`);
      continue;
    }
    const changes: string[] = [];
    if (currentField.label !== proposedField.label) changes.push(`label changes from "${currentField.label}" to "${proposedField.label}"`);
    if (currentField.type !== proposedField.type) changes.push(`type changes from ${currentField.type} to ${proposedField.type}`);
    if (currentField.type === "select" && proposedField.type === "select" && JSON.stringify(currentField.options) !== JSON.stringify(proposedField.options)) {
      changes.push(`options change from ${currentField.options.join(", ")} to ${proposedField.options.join(", ")}`);
    }
    if (currentField.required !== proposedField.required) changes.push(`required changes from ${currentField.required ? "yes" : "no"} to ${proposedField.required ? "yes" : "no"}`);
    if (changes.length) fieldItems.push(`Field changed: "${proposedField.label}"; ${changes.join(", ")}.`);
  }
  for (const currentField of current.fields) {
    if (!proposed.fields.some(field => field.id === currentField.id)) fieldItems.push(`Field removed: ${fieldDescription(currentField)}.`);
  }

  const viewItems: string[] = [];
  const kinds = [...new Set([...current.components.map(component => component.kind), ...proposed.components.map(component => component.kind)])];
  for (const kind of kinds) {
    const currentViews = current.components.filter(component => component.kind === kind);
    const proposedViews = proposed.components.filter(component => component.kind === kind);
    const count = Math.max(currentViews.length, proposedViews.length);
    for (let index = 0; index < count; index += 1) {
      const currentView = currentViews[index];
      const proposedView = proposedViews[index];
      const label = viewName(kind, index, count);
      if (!currentView && proposedView) viewItems.push(`View added: ${viewDescription(proposed, proposedView, label)}.`);
      else if (currentView && !proposedView) viewItems.push(`View removed: ${viewDescription(current, currentView, label)}.`);
      else if (currentView && proposedView && JSON.stringify(currentView.fields) !== JSON.stringify(proposedView.fields)) {
        viewItems.push(`View changed: ${label} changes from ${viewDescription(current, currentView)} to ${viewDescription(proposed, proposedView)}.`);
      }
    }
  }
  if (JSON.stringify(current.components.map(component => component.kind)) !== JSON.stringify(proposed.components.map(component => component.kind))) {
    viewItems.push(`View order changes from ${current.components.map(component => component.kind).join(", ")} to ${proposed.components.map(component => component.kind).join(", ")}.`);
  }

  const currentForms = current.components.filter(component => component.kind === "form");
  const proposedForms = proposed.components.filter(component => component.kind === "form");
  const behaviorItems: string[] = [];
  if (!currentForms.length && proposedForms.length) behaviorItems.push("Record entry added.");
  else if (currentForms.length && !proposedForms.length) behaviorItems.push("Record entry removed.");
  else if (JSON.stringify(currentForms.map(component => component.fields)) !== JSON.stringify(proposedForms.map(component => component.fields))) {
    const describeForms = (forms: typeof currentForms, spec: Spec) => forms.map(component => viewDescription(spec, component)).join("; ");
    behaviorItems.push(`Record entry changes from ${describeForms(currentForms, current)} to ${describeForms(proposedForms, proposed)}.`);
  }

  return [
    { heading: "Title", items: current.title === proposed.title ? ["No title change."] : [`Title changes from "${current.title}" to "${proposed.title}".`] },
    { heading: "Fields", items: fieldItems.length ? fieldItems : ["No field changes."] },
    { heading: "Views", items: viewItems.length ? viewItems : ["No view changes."] },
    { heading: "Behavior", items: behaviorItems.length ? behaviorItems : ["No record-entry behavior changes."] },
  ];
}

function recordImpact(value: Application, candidateVersion: number): string {
  if (!value.records.length) return "No existing records to check.";
  const rehearsal = value.rehearsal?.specVersion === candidateVersion ? value.rehearsal : null;
  if (!rehearsal) return "Not checked yet. Check this proposal to verify existing records.";
  const check = rehearsal.checks.find(item => item.name.toLowerCase().includes("existing records fit"));
  if (!check) return "The review checks did not return an existing-record result.";
  return check.passed ? "Passed. Record compatibility check passed for this proposal. Publishing checks the latest records again and does not delete them." : "Failed. One or more existing records do not fit this proposal.";
}

function ApplicationReview({ value, command, disabled }: { value: Application; command: Command; disabled: boolean }) {
  const id = useId();
  const liveRelease = value.status === "retired" ? null : value.release ?? null;
  const proposed = value.candidate?.spec ?? value.spec;
  const proposedVersion = value.candidate?.specVersion ?? value.specVersion;
  const hasProposedChanges = value.status !== "retired" && (!liveRelease || JSON.stringify(liveRelease.spec) !== JSON.stringify(proposed));
  if (!hasProposedChanges) return null;
  const rehearsal = value.rehearsal?.specVersion === proposedVersion ? value.rehearsal : null;
  const checksPassed = Boolean(rehearsal?.checks.length && rehearsal.checks.every(check => check.passed));
  const groups = applicationChangeGroups(liveRelease?.spec ?? null, proposed);
  return <details open={value.status === "draft"} className={group}>
    <summary className="cursor-pointer text-sm">Review changes</summary>
    <div className="mt-4 space-y-5">
      <p className="text-sm text-gray-muted">{liveRelease ? `Proposed version ${proposedVersion} compared with live version ${liveRelease.version}.` : "This is the first proposed version. Review it before publishing."}</p>
      {groups.map(groupItem => <section key={groupItem.heading} aria-labelledby={`${id}-${groupItem.heading.toLowerCase()}`} className="space-y-2"><h3 id={`${id}-${groupItem.heading.toLowerCase()}`} className="font-medium">{groupItem.heading}</h3><ul className="space-y-1 text-sm text-gray-muted">{groupItem.items.map(item => <li key={item}>{item}</li>)}</ul></section>)}
      <section aria-labelledby={`${id}-records`} className="space-y-2"><h3 id={`${id}-records`} className="font-medium">Existing records</h3><p className="text-sm text-gray-muted">{recordImpact(value, proposedVersion)}</p></section>
      {rehearsal ? <section aria-labelledby={`${id}-checks`} className="space-y-2"><h3 id={`${id}-checks`} className="font-medium">Checks for proposed version {proposedVersion}</h3><ul className="space-y-1 text-sm">{rehearsal.checks.map(check => <li key={check.name}>{check.passed ? "Passed" : "Failed"}: {check.name}</li>)}</ul></section> : null}
      <div className="flex flex-wrap gap-3">
        {!checksPassed ? <Button variant="secondary" disabled={disabled} onClick={() => void command({ kind: "rehearse", expectedDesignRevision: value.candidate?.designRevision ?? value.designRevision ?? 0 })}>{rehearsal ? "Run checks again" : "Check proposed change"}</Button> : null}
        <Button disabled={disabled || !checksPassed} onClick={() => void command({ kind: "publish", expectedCandidateRevision: value.candidate?.designRevision ?? value.designRevision ?? 0, expectedReleaseVersion: liveRelease?.version ?? null })}>Publish</Button>
      </div>
      {!checksPassed ? <p className="text-sm text-gray-muted">Publish is available after every check passes.</p> : null}
    </div>
  </details>;
}

function ApplicationResult({ value, workId, canManage, command, disabled }: { value: Application; workId: string; canManage: boolean; command: Command; disabled: boolean }) {
  const [values, setValues] = useState<Record<string, string | number | boolean>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [priorVersion, setPriorVersion] = useState("");
  const [priorRelease, setPriorRelease] = useState("");
  const id = useId();
  const requestId = useRef<string | null>(null);
  const selected = value.records.find(record => record.id === selectedId) || value.records[0];
  const liveRelease = value.status === "retired" ? null : value.release ?? null;
  const useSpec = liveRelease?.spec ?? value.spec;
  const canUse = liveRelease !== null;
  const components = value.records.length ? [...useSpec.components].sort((left, right) => Number(left.kind === "form") - Number(right.kind === "form")) : useSpec.components;
  const inspectIndex = components.findIndex(component => component.kind === "detail" || component.kind === "document");
  async function submit(event: FormEvent, fieldIds: string[]) {
    event.preventDefault();
    if (!liveRelease || value.recordsRevision === undefined) return;
    requestId.current ??= crypto.randomUUID();
    const submitted = Object.fromEntries(fieldIds.flatMap(key => values[key] !== undefined ? [[key, values[key]]] : useSpec.fields.find(field => field.id === key)?.type === "boolean" ? [[key, false]] : []));
    if (await command({ kind: "submit", expectedReleaseVersion: liveRelease.version, expectedRecordsRevision: value.recordsRevision, record: { id: requestId.current, values: submitted } })) { setValues({}); requestId.current = null; }
  }
  const availability = value.status === "retired"
    ? "Retired. Existing records remain available to inspect."
    : liveRelease
      ? `Version ${liveRelease.version} is live.${value.status === "draft" ? " You are editing a draft; live use continues while you check the next version." : " Available to members of this workspace."}`
      : "No version is live yet. Check the draft before publishing it.";
  return <>
    <p className="text-sm text-gray-muted">{availability} This is a private app, with no public deployment.</p>
    <ApplicationAccessControls workId={workId} status={value.status} hasRelease={Boolean(value.release)} canManage={canManage} disabled={disabled} />
    <section className={`${group} space-y-8`} aria-labelledby={`${id}-live-app-heading`}>
      <h2 id={`${id}-live-app-heading`} className="font-display text-2xl">{liveRelease ? "Live app" : "Proposed app"}</h2>
      {liveRelease ? <p className="text-sm text-gray-muted">Version {liveRelease.version} is the version people use now.</p> : null}
      <div className="space-y-8" aria-label="Private application">{components.map((component, index) => {
        const fields = component.fields.map(key => useSpec.fields.find(field => field.id === key)!).filter(Boolean);
        if (component.kind === "form") return <details key={index} open={!value.records.length} className={group}><summary className="cursor-pointer text-sm">{value.records.length ? "Add another record" : "Add a first record"}</summary><form onSubmit={event => void submit(event, component.fields)} className={group}><h2 className="font-display text-xl">Add a record</h2>{fields.map(field => field.type === "boolean" ? <label key={field.id} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={values[field.id] === true} disabled={disabled || !canUse || value.recordsRevision === undefined} onChange={event => setValues(current => ({ ...current, [field.id]: event.target.checked }))} />{field.label}</label> : field.type === "select" ? <label key={field.id} className="block text-sm"><span className="block text-[11px] text-gray-muted">{field.label}{field.required ? " *" : ""}</span><select id={`workspace-app-field-${field.id}`} className={`${control} mt-1`} value={values[field.id] === undefined ? "" : String(values[field.id])} required={field.required} disabled={disabled || !canUse || value.recordsRevision === undefined} onChange={event => setValues(current => ({ ...current, [field.id]: event.target.value }))}><option value="">Choose an option</option>{field.options.map(option => <option key={option} value={option}>{option}</option>)}</select></label> : <TextInput key={field.id} label={field.label} type={field.type === "number" ? "number" : "text"} step={field.type === "number" ? "any" : undefined} value={values[field.id] === undefined ? "" : String(values[field.id])} maxLength={field.type === "text" ? 10000 : undefined} required={field.required} disabled={disabled || !canUse || value.recordsRevision === undefined} onChange={event => setValues(current => ({ ...current, [field.id]: field.type === "number" && event.target.value !== "" ? Number(event.target.value) : event.target.value }))} />)}<Button type="submit" disabled={disabled || !canUse || value.recordsRevision === undefined}>Save record</Button></form></details>;
        if (component.kind === "list") return <section key={index} className={group}><h2 className="font-display text-xl">Records</h2>{value.records.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{fields.map(field => <th key={field.id} scope="col" className="p-3 font-medium">{field.label}</th>)}{inspectIndex >= 0 ? <th scope="col"><span className="sr-only">Open record</span></th> : null}</tr></thead><tbody>{value.records.map((record, recordIndex) => <tr key={record.id} className="border-t border-gray-border">{fields.map(field => <td key={field.id} className="max-w-xs break-words p-3">{record.values[field.id] === undefined ? "Not recorded" : String(record.values[field.id])}</td>)}{inspectIndex >= 0 ? <td><button type="button" className="min-h-11 px-3 underline" onClick={() => { setSelectedId(record.id); document.getElementById(`${id}-record-${inspectIndex}`)?.focus(); }} aria-controls={`${id}-record-${inspectIndex}`}>Open<span className="sr-only"> record {recordIndex + 1}</span></button></td> : null}</tr>)}</tbody></table></div> : <p className="text-sm text-gray-muted">No records yet.</p>}</section>;
        return <section key={index} id={`${id}-record-${index}`} tabIndex={-1} className={group} aria-live="polite"><h2 className="font-display text-xl">{component.kind === "document" ? "Record document" : "Selected record"}</h2>{selected ? <dl className="space-y-4">{fields.map(field => <div key={field.id}><dt className="text-sm text-gray-muted">{field.label}</dt><dd className="whitespace-pre-wrap break-words">{selected.values[field.id] === undefined ? "Not recorded" : String(selected.values[field.id])}</dd></div>)}</dl> : <p className="text-sm text-gray-muted">Save or select a record to inspect it.</p>}</section>;
      })}</div>
    </section>
    <ApplicationReview value={value} command={command} disabled={disabled} />
    {value.installation ? <SourceUpdate key={value.installation.sourceVersion} value={value} command={command} disabled={disabled} /> : null}
    <EditApplicationSpec key={value.specVersion} value={value} command={command} disabled={disabled} />
    {(value.releases?.length ?? 0) > 1 && liveRelease ? <details className={group}><summary className="cursor-pointer text-sm">Restore an earlier live version</summary><p className="text-sm text-gray-muted">This changes the version people use now. Existing records and their attribution remain in place.</p><label className="text-sm">Released version<select className={control} value={priorRelease} disabled={disabled} onChange={event => setPriorRelease(event.target.value)}><option value="">Choose a released version</option>{value.releases?.filter(release => release.version !== liveRelease.version).map(release => <option key={release.version} value={release.version}>Version {release.version}: {release.spec.title}</option>)}</select></label><Button variant="secondary" disabled={disabled || !priorRelease} onClick={() => void command({ kind: "rollback_release", expectedDesignRevision: value.candidate?.designRevision ?? value.designRevision ?? 0, expectedReleaseVersion: liveRelease.version, version: Number(priorRelease) })}>Restore released version</Button></details> : null}
    {value.versions.length > 1 ? <details className={group}><summary className="cursor-pointer text-sm">Use an earlier version as a proposed change</summary><p className="text-sm text-gray-muted">This prepares an earlier version for review. It does not change the live app until you check and publish it. Existing records remain.</p><label className="text-sm">Earlier version<select className={control} value={priorVersion} disabled={disabled} onChange={event => setPriorVersion(event.target.value)}><option value="">Choose a version</option>{value.versions.filter(version => version.version !== value.specVersion).map(version => <option key={version.version} value={version.version}>Version {version.version}: {version.spec.title}</option>)}</select></label><Button variant="secondary" disabled={disabled || !priorVersion} onClick={() => void command({ kind: "rollback", version: Number(priorVersion) })}>Use version as proposed change</Button></details> : null}
  </>;
}
function ScheduleResult({ value, command, disabled }: { value: Schedule; command: Command; disabled: boolean }) {
  const [title, setTitle] = useState(""); const [start, setStart] = useState(""); const [end, setEnd] = useState(""); const [error, setError] = useState("");
  const [reschedule, setReschedule] = useState<{ requestId: string; start: string; end: string; error: string } | null>(null);
  const requestId = useRef<string | null>(null);
  async function reserve(event: FormEvent) {
    event.preventDefault(); setError(""); requestId.current ??= crypto.randomUUID();
    try { if (await command({ kind: "reserve", title, start: iso(start), end: iso(end), requestId: requestId.current })) { setTitle(""); requestId.current = null; } }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Check the reservation time."); }
  }
  async function saveReschedule(event: FormEvent, reservationId: string) {
    event.preventDefault();
    if (!reschedule || reschedule.requestId !== reservationId) return;
    setReschedule(current => current ? { ...current, error: "" } : current);
    try {
      const saved = await command({ kind: "reschedule", requestId: reservationId, start: iso(reschedule.start), end: iso(reschedule.end) });
      if (saved) setReschedule(null);
      else setReschedule(current => current ? { ...current, error: "The new time could not be saved. Review the message above and try again." } : current);
    } catch (cause) {
      setReschedule(current => current ? { ...current, error: cause instanceof Error ? cause.message : "Check the new reservation time." } : current);
    }
  }
  return <>
    <p className="text-sm text-gray-muted">Reservations are held in this workspace. No external calendar is connected. Times use your device’s timezone.</p>
    <section className={group}><h2 className="font-display text-xl">Available windows</h2><ul className="space-y-2 text-sm">{value.availability.map((slot, index) => <li key={index}>{time(slot.start)} to {time(slot.end)}</li>)}</ul></section>
    <section className={group}><h2 className="font-display text-xl">Reservations</h2>{value.reservations.length ? <ul className="space-y-4">{value.reservations.map(reservation => <li key={reservation.requestId} className="space-y-2 text-sm"><strong>{reservation.title}</strong><p>{time(reservation.start)} to {time(reservation.end)}</p><p>{reservation.status === "reserved" ? "Reserved in workspace" : reservation.status === "cancelled" ? "Cancelled" : reservation.status === "accepted" ? `Provider accepted · verification ${reservation.verification || "pending"}` : "Provider confirmation unresolved; do not repeat the reservation."}</p>{reservation.status === "reserved" ? <>
      <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={disabled} onClick={() => setReschedule({ requestId: reservation.requestId, start: localDateTime(reservation.start), end: localDateTime(reservation.end), error: "" })}>Change time for {reservation.title}</Button><Button variant="secondary" disabled={disabled} onClick={() => void command({ kind: "cancel", requestId: reservation.requestId })}>Cancel {reservation.title}</Button></div>
      {reschedule?.requestId === reservation.requestId ? <form className="space-y-3 rounded-xl border border-gray-border p-3" onSubmit={event => void saveReschedule(event, reservation.requestId)}><h3 className="font-medium">Change time for {reservation.title}</h3><TimeFields labelPrefix="New " start={reschedule.start} end={reschedule.end} setStart={startValue => setReschedule(current => current ? { ...current, start: startValue } : current)} setEnd={endValue => setReschedule(current => current ? { ...current, end: endValue } : current)} disabled={disabled} />{reschedule.error ? <p role="alert" className="text-sm text-critical">{reschedule.error}</p> : null}<div className="flex flex-wrap gap-2"><Button type="submit" disabled={disabled}>Save new time for {reservation.title}</Button><Button type="button" variant="secondary" disabled={disabled} onClick={() => setReschedule(null)}>Keep current time</Button></div></form> : null}
    </> : null}</li>)}</ul> : <p className="text-sm text-gray-muted">No time has been reserved yet.</p>}</section>
    <form className={group} onSubmit={event => void reserve(event)}><h2 className="font-display text-xl">Reserve a time</h2><TextInput label="Reservation name" value={title} required maxLength={160} disabled={disabled} onChange={event => setTitle(event.target.value)} /><TimeFields start={start} end={end} setStart={setStart} setEnd={setEnd} disabled={disabled} />{error ? <p role="alert" className="text-sm text-critical">{error}</p> : null}<Button type="submit" disabled={disabled || !title.trim()}>Reserve in workspace</Button></form>
  </>;
}
function InvestigationResult({ value, command, disabled, sources, workspaceId }: { value: Investigation; command: Command; disabled: boolean; sources: WorkspaceWork[]; workspaceId: string }) {
  const requestId = useRef<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  const due = Date.parse(value.nextRunAt) <= now;
  async function run() { requestId.current ??= crypto.randomUUID(); if (await command({ requestId: requestId.current }, "run")) requestId.current = null; }
  return <><p className="text-sm text-gray-muted">{value.status === "paused" ? "Paused. Resume before checking the sources." : `Next check due ${time(value.nextRunAt)}.`} Automatic checks require background execution to be enabled.</p><div className="flex flex-wrap gap-3"><Button disabled={disabled || value.status !== "active" || !due} onClick={() => void run()}>Check sources now</Button><Button variant="secondary" disabled={disabled} onClick={() => void command({ kind: value.status === "paused" ? "resume" : "pause" })}>{value.status === "paused" ? "Resume checks" : "Pause checks"}</Button></div><details className={group}><summary className="cursor-pointer text-sm">Compared sources</summary><ul className="space-y-3 text-sm">{value.sources.map(source => <li key={source.workId}><a className="underline" href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}&work=${encodeURIComponent(source.workId)}`}>{sources.find(item => item.id === source.workId)?.title || "Saved source"}</a>{source.keyField ? <p>Matching on {source.keyField}; comparing {source.valueField}.</p> : <p>Comparing document text.</p>}</li>)}</ul></details><section className={group}><h2 className="font-display text-xl">What the checks found</h2>{value.runs.length ? <ol className="space-y-6">{value.runs.slice().reverse().map(run => <li key={run.requestId} className="space-y-3"><h3 className="font-medium">{run.result === "no_change" ? "Sources have not changed" : run.result === "agreement" ? "Sources agree" : `${run.differences.length} differences found`}</h3><p className="text-sm text-gray-muted">{time(run.at)}. {run.result === "no_change" && run.differences.length ? "Previous differences remain unresolved." : ""}</p>{run.differences.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th scope="col" className="p-2">Record</th><th scope="col" className="p-2">First source</th><th scope="col" className="p-2">Second source</th></tr></thead><tbody>{run.differences.map(difference => <tr key={difference.key} className="border-t border-gray-border"><th scope="row" className="p-2 font-normal">{difference.key}</th><td className="max-w-xs whitespace-pre-wrap break-words p-2">{difference.left ?? "Missing"}</td><td className="max-w-xs whitespace-pre-wrap break-words p-2">{difference.right ?? "Missing"}</td></tr>)}</tbody></table></div> : null}<details className="text-sm"><summary className="cursor-pointer">Source versions</summary>{run.sources.map(source => <p key={source.workId}>{sources.find(item => item.id === source.workId)?.title || "Saved source"}: revision {source.revision}, last changed {time(source.updatedAt)}</p>)}</details></li>)}</ol> : <p className="text-sm text-gray-muted">No check has run yet. Missing evidence is not agreement.</p>}</section></>;
}

type ApplicationViewKind = Spec["components"][number]["kind"];
const applicationViewKinds: ApplicationViewKind[] = ["form", "list", "detail", "document"];

function applicationViewLabel(kind: ApplicationViewKind): string {
  return kind === "form" ? "Entry form" : kind === "list" ? "Record list" : kind === "detail" ? "Record details" : "Record document";
}

function EditApplicationSpec({ value, command, disabled }: { value: Application; command: Command; disabled: boolean }) {
  const [title, setTitle] = useState(value.spec.title);
  const [fields, setFields] = useState<Spec["fields"]>(() => value.spec.fields.map(field => ({ ...field })));
  const [components, setComponents] = useState<Spec["components"]>(() => value.spec.components.map(component => ({ ...component, fields: [...component.fields] })));
  const [newViewKind, setNewViewKind] = useState<ApplicationViewKind>("detail");
  const [editorError, setEditorError] = useState("");
  const changed = title !== value.spec.title || JSON.stringify(fields) !== JSON.stringify(value.spec.fields) || JSON.stringify(components) !== JSON.stringify(value.spec.components);

  function updateField(fieldId: string, update: { label?: string; required?: boolean; options?: string[] }) {
    setEditorError("");
    setFields(current => current.map(field => {
      if (field.id !== fieldId) return field;
      const next = { label: update.label ?? field.label, required: update.required ?? field.required };
      return field.type === "select"
        ? { ...field, ...next, options: update.options ?? field.options }
        : { ...field, ...next };
    }));
  }

  function updateFieldType(fieldId: string, type: Spec["fields"][number]["type"]) {
    setEditorError("");
    setFields(current => current.map(field => field.id === fieldId ? fieldWithType(field, type) : field));
  }

  function addField() {
    setEditorError("");
    let id = `field_${crypto.randomUUID().replaceAll("-", "")}`;
    while (fields.some(field => field.id === id)) {
      id = `field_${crypto.randomUUID().replaceAll("-", "")}`;
    }
    setFields(current => [...current, { id, label: `New field ${current.length + 1}`, type: "text", required: false }]);
  }

  function removeField(fieldId: string) {
    if (fields.length <= 1) {
      setEditorError("Keep at least one field in the app.");
      return;
    }
    const blockingView = components.find(component => component.fields.length === 1 && component.fields[0] === fieldId);
    if (blockingView) {
      setEditorError(`Remove ${applicationViewLabel(blockingView.kind)} or include another field before removing this field.`);
      return;
    }
    setEditorError("");
    setFields(current => current.filter(field => field.id !== fieldId));
    setComponents(current => current.map(component => ({ ...component, fields: component.fields.filter(id => id !== fieldId) })));
  }

  function toggleViewField(componentIndex: number, fieldId: string, checked: boolean) {
    const component = components[componentIndex];
    if (!component) return;
    const nextFields = checked ? [...new Set([...component.fields, fieldId])] : component.fields.filter(id => id !== fieldId);
    if (!nextFields.length) {
      setEditorError(`${applicationViewLabel(component.kind)} needs at least one field.`);
      return;
    }
    setEditorError("");
    setComponents(current => current.map((item, index) => index === componentIndex ? { ...item, fields: nextFields } : item));
  }

  function addView() {
    const viewKind = selectedAddKind;
    if (!viewKind || components.some(component => component.kind === viewKind) || !fields[0]) return;
    setEditorError("");
    setComponents(current => [...current, { kind: viewKind, fields: [fields[0]!.id] }]);
  }

  function removeView(index: number) {
    if (components.length <= 1) {
      setEditorError("Keep at least one view in the app.");
      return;
    }
    setEditorError("");
    setComponents(current => current.filter((_, componentIndex) => componentIndex !== index));
  }

  function moveView(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= components.length) return;
    setEditorError("");
    setComponents(current => {
      const next = [...current];
      const [moved] = next.splice(index, 1);
      if (moved) next.splice(nextIndex, 0, moved);
      return next;
    });
  }

  const addableKinds = applicationViewKinds.filter(kind => !components.some(component => component.kind === kind));
  const selectedAddKind = addableKinds.includes(newViewKind) ? newViewKind : addableKinds[0] ?? "";
  return <details className={group}><summary className="cursor-pointer text-sm">Edit proposed app</summary><form className="space-y-5" onSubmit={event => { event.preventDefault(); setEditorError(""); void command({ kind: "revise", expectedDesignRevision: value.candidate?.designRevision ?? value.designRevision ?? 0, spec: { ...value.spec, title, fields, components } }); }}><p className="text-sm text-gray-muted">Changing the app creates a new draft. Existing records remain, and the current live version keeps working while you check the draft.</p><TextInput label="App name" value={title} maxLength={160} required disabled={disabled} onChange={event => { setEditorError(""); setTitle(event.target.value); }} /><fieldset className={group}><legend className="font-medium">Fields</legend><div className="space-y-4">{fields.map((field, index) => <div key={field.id} className="space-y-3 rounded-lg border border-gray-border p-3"><div className="grid gap-3 sm:grid-cols-[1fr_150px_auto_auto]"><TextInput label={`Label for ${field.label}`} value={field.label} maxLength={80} required disabled={disabled} onChange={event => updateField(field.id, { label: event.target.value })} /><label className="text-sm">Type<select aria-label={`Type for ${field.label}`} className={control} value={field.type} disabled={disabled} onChange={event => updateFieldType(field.id, event.target.value as Spec["fields"][number]["type"])}><option value="text">Text</option><option value="number">Number</option><option value="boolean">Yes or no</option><option value="select">Choose one</option></select></label><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" aria-label={`Required for ${field.label}`} checked={field.required} disabled={disabled} onChange={event => updateField(field.id, { required: event.target.checked })} />Required</label><Button type="button" variant="secondary" disabled={disabled || fields.length <= 1} onClick={() => removeField(field.id)}>Remove field<span className="sr-only"> {index + 1}</span></Button>{field.type === "select" ? <SelectOptionsEditor field={field} disabled={disabled} onChange={options => updateField(field.id, { options })} /> : null}</div></div>)}</div><Button type="button" variant="secondary" disabled={disabled || fields.length >= 30} onClick={addField}>Add field</Button></fieldset><fieldset className={group}><legend className="font-medium">Views</legend><p className="text-sm text-gray-muted">Choose which fields each view shows. Views use the same fixed app behavior as the live app.</p><div className="space-y-4">{components.map((component, index) => <fieldset key={`${component.kind}-${index}`} className="space-y-3 rounded-lg border border-gray-border p-3"><legend className="font-medium">{applicationViewLabel(component.kind)}</legend><div className="grid gap-2 sm:grid-cols-2">{fields.map(field => <label key={field.id} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" aria-label={`Show ${field.label} in ${component.kind} view`} checked={component.fields.includes(field.id)} disabled={disabled} onChange={event => toggleViewField(index, field.id, event.target.checked)} />{field.label}</label>)}</div><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={disabled || index === 0} onClick={() => moveView(index, -1)}>Move up</Button><Button type="button" variant="secondary" disabled={disabled || index === components.length - 1} onClick={() => moveView(index, 1)}>Move down</Button><Button type="button" variant="secondary" disabled={disabled || components.length <= 1} onClick={() => removeView(index)}>Remove view</Button></div></fieldset>)}</div>{addableKinds.length ? <div className="flex flex-wrap items-end gap-3"><label className="text-sm">View to add<select aria-label="View to add" className={control} value={selectedAddKind} disabled={disabled} onChange={event => setNewViewKind(event.target.value as ApplicationViewKind)}>{addableKinds.map(kind => <option key={kind} value={kind}>{applicationViewLabel(kind)}</option>)}</select></label><Button type="button" variant="secondary" disabled={disabled || !selectedAddKind} onClick={addView}>Add view</Button></div> : <p className="text-sm text-gray-muted">All supported views are included.</p>}</fieldset>{editorError ? <p role="alert" className="text-sm text-critical">{editorError}</p> : null}<Button type="submit" disabled={disabled || !changed}>Save new draft</Button></form></details>;
}

function CopyApplication({ sources, disabled, copy }: { sources: WorkspaceWork[]; disabled: boolean; copy: (id: string) => Promise<boolean> }) {
  const [sourceId, setSourceId] = useState("");
  const apps = sources.filter(source => source.productId === "applications" && !source.unavailableReason);
  if (!apps.length) return null;
  return <details className={group}><summary className="cursor-pointer text-sm">Start from an existing app</summary><p className="text-sm text-gray-muted">Copies its design into a new draft. Records, access grants, and connections stay with the original.</p><label className="text-sm">Source app<select className={control} value={sourceId} disabled={disabled} onChange={event => setSourceId(event.target.value)}><option value="">Choose an available app</option>{apps.map(app => <option key={app.id} value={app.id}>{app.title}</option>)}</select></label><Button disabled={disabled || !sourceId} onClick={() => void copy(sourceId)}>Create a private copy</Button></details>;
}
function SourceUpdate({ value, command, disabled }: { value: Application; command: Command; disabled: boolean }) {
  const [source, setSource] = useState<Application | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  if (!value.installation) return null;
  async function check() {
    setChecking(true); setError("");
    try { const result = await response(await fetch(`/api/bounded-work?productId=applications&workId=${encodeURIComponent(value.installation!.sourceWorkId)}`, { cache: "no-store" })); setSource(applicationSchema.parse(result.payload)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The source could not be checked."); }
    finally { setChecking(false); }
  }
  const sourceRelease = source?.status === "retired" ? null : source?.release ?? null;
  return <details className={group}><summary className="cursor-pointer text-sm">Source design and updates</summary><p className="text-sm text-gray-muted">Using published source version {value.installation.sourceVersion}. Your local changes are preserved unless an update conflicts.</p><Button variant="secondary" disabled={checking} onClick={() => void check()}>{checking ? "Checking…" : "Check source version"}</Button>{error ? <p role="alert" className="text-sm text-critical">{error}</p> : null}{source ? sourceRelease ? <><p className="text-sm">Published source version {sourceRelease.version}: {sourceRelease.spec.title}</p><p className="text-sm text-gray-muted">Fields: {sourceRelease.spec.fields.map(field => field.label).join(", ")}.</p>{sourceRelease.version === value.installation.sourceVersion ? <p className="text-sm">You have the current published source version.</p> : <><p className="text-sm text-gray-muted">An update creates a draft. Your current live version keeps working while you check it.</p><Button disabled={disabled} onClick={() => void command({ kind: "adopt_update", sourceVersion: sourceRelease.version })}>Prepare version {sourceRelease.version} update</Button></>} </> : <p className="text-sm text-gray-muted">The source has no published version available.</p> : null}</details>;
}
