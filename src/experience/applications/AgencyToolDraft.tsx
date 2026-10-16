"use client";
/**
 * The agency's internal tool draft, as XA · AG4 (prepare and send): the
 * story on the left holds the questions, edited in place; the object on the
 * right is the tool as the client's team will see it, with what changed in
 * plain sentences and the one yes, "Send to <owner>".
 *
 * Data and authority are the real bounded-work ones: the draft loads from
 * /api/bounded-work, "Send" saves a revision (when something changed) and
 * runs the draft's checks through the same commands the old editor used. The
 * agency never makes it live; the owner does, from their own workspace.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import type { z } from "zod";
import {
  XaBlock, XaButton, XaCrumbs, XaDecision, XaEmpty, XaHeadline, XaNote, XaObjectPage, XaSelect, XaStatus, XaTextLink, XaWorking, XaYes,
  type XaWorkingStep, type XaYesState,
} from "@/components/ui/strelva/Xa";
import { applicationSchema, type applicationSpecSchema } from "@/products/applications/contracts";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";
import { ApplicationUseRenderer, type ApplicationUseDraft } from "./ApplicationUseRenderer";
import { applicationPreviewSnapshot } from "./ApplicationDraftPreview";
import styles from "./agency-tool-draft.module.css";

type Application = z.infer<typeof applicationSchema>;
type Spec = z.infer<typeof applicationSpecSchema>;
type Field = Spec["fields"][number];
type ViewKind = Spec["components"][number]["kind"];

/** Who the draft is for and who is preparing it, read on the server from the grant. */
export interface AgencyToolDraftContext {
  businessName: string;
  businessHref?: string;
  /** The owner who opened the draft to the agency, by name ("Dr. Amy Lin"). */
  ownerName: string | null;
  agencyName: string;
  personName: string;
  clientsHref?: string;
}

const TYPE_OPTIONS = [
  { value: "text", label: "Words" }, { value: "number", label: "A number" }, { value: "boolean", label: "Yes or no" },
  { value: "date", label: "A date" }, { value: "select", label: "One of a list" },
] as const;
const VIEW_WORDS: Record<ViewKind, string> = { form: "the form", list: "the list", detail: "one record", document: "the printable page" };

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const quote = (text: string) => `“${text}”`;
const list = (items: readonly string[]) => items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
const count = (n: number, one: string, many: string) => `${n === 1 ? "one" : n === 2 ? "two" : n === 3 ? "three" : n} ${n === 1 ? one : many}`;

function withType(field: Field, type: Field["type"]): Field {
  const base = { id: field.id, label: field.label, required: field.required };
  return type === "select" ? { ...base, type, options: field.type === "select" ? field.options : ["First choice", "Second choice"] } : { ...base, type } as Field;
}

/** What the owner's team will notice, one sentence each, in the owner's words. */
export function toolChangeSentences(before: Spec | null, after: Spec, reader: string): string[] {
  if (!before) return [`${reader} sees a new internal tool, ${quote(after.title)}, with ${count(after.fields.length, "question", "questions")}.`];
  const sentences: string[] = [];
  const formOf = (spec: Spec) => spec.components.find(component => component.kind === "form");
  const added = after.fields.filter(field => !before.fields.some(item => item.id === field.id));
  if (added.length) sentences.push(`${reader} sees ${count(added.length, "new question", "new questions")} on ${formOf(after) ? "the form" : quote(after.title)}: ${list(added.map(field => quote(field.label)))}.`);
  const removed = before.fields.filter(field => !after.fields.some(item => item.id === field.id));
  if (removed.length) sentences.push(`${list(removed.map(field => quote(field.label)))} ${removed.length === 1 ? "comes" : "come"} off the form. Answers already given stay on their records.`);
  for (const field of after.fields) {
    const old = before.fields.find(item => item.id === field.id);
    if (!old) continue;
    if (old.label !== field.label) sentences.push(`${quote(old.label)} now reads ${quote(field.label)}.`);
    if (old.type !== field.type) sentences.push(`${quote(field.label)} now takes ${TYPE_OPTIONS.find(option => option.value === field.type)?.label.toLowerCase() ?? field.type}.`);
    else if (old.type === "select" && field.type === "select" && old.options.join("\n") !== field.options.join("\n")) sentences.push(`${quote(field.label)} offers ${list(field.options)}.`);
    if (old.required !== field.required) sentences.push(`${quote(field.label)} is now ${field.required ? "required" : "optional"}.`);
  }
  for (const component of after.components) {
    const old = before.components.find(item => item.kind === component.kind);
    if (!old) { sentences.push(`${reader}'s team can now use ${VIEW_WORDS[component.kind]}.`); continue; }
    const shown = component.fields.filter(id => !old.fields.includes(id)).flatMap(id => after.fields.find(field => field.id === id && !added.includes(field))?.label ?? []);
    if (shown.length && component.kind !== "form") sentences.push(`${list(shown.map(quote))} now ${shown.length === 1 ? "shows" : "show"} in ${VIEW_WORDS[component.kind]}.`);
  }
  for (const old of before.components) if (!after.components.some(item => item.kind === old.kind)) sentences.push(`${VIEW_WORDS[old.kind].charAt(0).toUpperCase()}${VIEW_WORDS[old.kind].slice(1)} goes away. No records are deleted.`);
  if (before.title !== after.title) sentences.push(`The tool is renamed ${quote(after.title)}.`);
  return sentences;
}

async function readBody(response: Response): Promise<{ id: string; payload: unknown }> {
  const body = await response.json().catch(() => ({})) as { id?: string; payload?: unknown; error?: string };
  if (!response.ok) throw new Error(body.error || "The draft couldn't be saved. Your edits are still here.");
  if (!body.id) throw new Error("The saved draft came back without its name. Reload before sending again.");
  return { id: body.id, payload: body.payload };
}

export function AgencyToolDraft({ workId, context, canEdit, until, notice }: { workId: string; context: AgencyToolDraftContext; canEdit: boolean; until: string | null; notice?: ReactNode }) {
  const request = useWorkspaceRequest();
  const [value, setValue] = useState<Application | null>(null);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    request(`/api/bounded-work?productId=applications&workId=${encodeURIComponent(workId)}`, { cache: "no-store", signal: controller.signal })
      .then(readBody)
      .then(body => { if (!controller.signal.aborted) { setValue(applicationSchema.parse(body.payload)); setLoadError(""); } })
      .catch(cause => { if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : "The draft couldn't be read."); });
    return () => controller.abort();
  }, [request, workId, reload]);

  const owner = context.ownerName ?? context.businessName;
  const crumbs = <XaCrumbs items={[{ label: "Clients", href: context.clientsHref }, { label: context.businessName, href: context.businessHref }, { label: "Internal tools" }, { label: value?.candidate?.spec.title ?? value?.spec.title ?? "Draft" }]} />;
  if (loadError && !value) return <XaObjectPage head={crumbs} story={<div role="alert"><XaEmpty pose="fixing" title="This draft couldn't be opened" job={`Nothing changed in ${context.businessName}'s tool.`}
    action={<XaButton variant="primary" size="lg" onClick={() => setReload(n => n + 1)}>Try again</XaButton>}>{loadError}</XaEmpty></div>} />;
  if (!value) return <XaObjectPage head={crumbs} story={<XaWorking title="Opening the draft" steps={[{ id: "read", label: `Reading ${context.businessName}'s internal tool`, state: "active" }]} />} />;
  return <Editor key={`${value.candidate?.designRevision ?? value.designRevision ?? 0}:${value.specVersion}`} value={value} workId={workId} context={context} owner={owner} crumbs={crumbs}
    canEdit={canEdit} until={until} notice={notice} onSaved={setValue} />;
}

function Editor({ value, workId, context, owner, crumbs, canEdit, until, notice, onSaved }: { value: Application; workId: string; context: AgencyToolDraftContext; owner: string; crumbs: ReactNode; canEdit: boolean; until: string | null; notice?: ReactNode; onSaved: (value: Application) => void }) {
  const request = useWorkspaceRequest();
  const id = useId();
  const base = value.candidate?.spec ?? value.spec;
  const live = value.status === "retired" ? null : value.release ?? null;
  const [title, setTitle] = useState(base.title);
  const [fields, setFields] = useState<Field[]>(() => base.fields.map(field => ({ ...field })));
  const [components, setComponents] = useState<Spec["components"]>(() => base.components.map(component => ({ ...component, fields: [...component.fields] })));
  const [editError, setEditError] = useState("");
  const [yes, setYes] = useState<XaYesState>("waiting");
  const [steps, setSteps] = useState<XaWorkingStep[]>([]);
  const [failure, setFailure] = useState<string>("");
  const [previewDraft, setPreviewDraft] = useState<ApplicationUseDraft>({ values: {}, recordId: `${id}-p`, idempotencyKey: `${id}-p` });
  const sending = useRef(false);

  const spec: Spec = useMemo(() => ({ ...base, title, fields, components }), [base, title, fields, components]);
  const dirty = JSON.stringify(spec) !== JSON.stringify(base);
  const sentences = toolChangeSentences(live?.spec ?? null, spec, owner);
  const version = value.candidate?.specVersion ?? value.specVersion;
  const rehearsal = (value.candidate?.rehearsal ?? value.rehearsal)?.specVersion === version ? (value.candidate?.rehearsal ?? value.rehearsal) : null;
  const sent = !dirty && Boolean(rehearsal?.checks.length && rehearsal.checks.every(check => check.passed));
  const failed = !dirty ? rehearsal?.checks.filter(check => !check.passed) ?? [] : [];
  const disabled = !canEdit || yes === "going";

  function edit(next: () => void) { setEditError(""); next(); if (yes !== "waiting" && yes !== "going") setYes("waiting"); }
  function updateField(fieldId: string, change: (field: Field) => Field) { edit(() => setFields(current => current.map(field => field.id === fieldId ? change(field) : field))); }
  function addField() {
    edit(() => {
      let next = `field_${crypto.randomUUID().replaceAll("-", "")}`;
      while (fields.some(field => field.id === next)) next = `field_${crypto.randomUUID().replaceAll("-", "")}`;
      setFields(current => [...current, { id: next, label: "New question", type: "text", required: false }]);
      setComponents(current => current.map(component => component.kind === "form" || component.kind === "list" ? { ...component, fields: [...component.fields, next] } : component));
    });
  }
  function removeField(fieldId: string) {
    if (fields.length <= 1) { setEditError("Keep at least one question."); return; }
    const lone = components.find(component => component.fields.length === 1 && component.fields[0] === fieldId);
    if (lone) { setEditError(`${quote(fields.find(field => field.id === fieldId)?.label ?? "This question")} is the only thing ${VIEW_WORDS[lone.kind]} shows. Show another question there first.`); return; }
    edit(() => { setFields(current => current.filter(field => field.id !== fieldId)); setComponents(current => current.map(component => ({ ...component, fields: component.fields.filter(item => item !== fieldId) }))); });
  }
  function toggleIn(kind: ViewKind, fieldId: string) {
    const component = components.find(item => item.kind === kind);
    if (!component) return;
    const next = component.fields.includes(fieldId) ? component.fields.filter(item => item !== fieldId) : [...component.fields, fieldId];
    if (!next.length) { setEditError(`${VIEW_WORDS[kind].charAt(0).toUpperCase()}${VIEW_WORDS[kind].slice(1)} needs at least one question.`); return; }
    edit(() => setComponents(current => current.map(item => item.kind === kind ? { ...item, fields: next } : item)));
  }

  const post = useCallback(async (command: Record<string, unknown>, action: "command" | "run" = "command") => {
    const response = await request("/api/bounded-work", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: "applications", action, workId, command }) });
    return applicationSchema.parse((await readBody(response)).payload);
  }, [request, workId]);

  async function send() {
    if (sending.current || !canEdit) return;
    sending.current = true;
    setYes("going"); setFailure("");
    const saveStep = dirty ? [{ id: "save", label: "Saving the draft", state: "active" as const }] : [];
    const checkLabel = value.records.length ? `Checking it against ${count(value.records.length, "record", "records")} ${context.businessName} already has` : "Checking every question works";
    setSteps([...saveStep, { id: "check", label: checkLabel, state: dirty ? "pending" : "active" }]);
    try {
      let current = value;
      if (dirty) {
        current = await post({ kind: "revise", expectedDesignRevision: value.candidate?.designRevision ?? value.designRevision ?? 0, spec });
        setSteps([{ id: "save", label: "Saved the draft", state: "done" }, { id: "check", label: checkLabel, state: "active" }]);
      }
      current = await post({ kind: "rehearse", expectedDesignRevision: current.candidate?.designRevision ?? current.designRevision ?? 0 });
      const result = (current.candidate?.rehearsal ?? current.rehearsal);
      const bad = result?.checks.filter(check => !check.passed) ?? [];
      setSteps(previous => previous.map(step => step.id === "check" ? { ...step, label: bad.length ? `${count(bad.length, "check", "checks")} didn't pass` : "Every check passed", state: bad.length ? "failed" : "done" } : step));
      if (bad.length) { setFailure(`It wasn't sent. ${bad.map(check => check.name).join(". ")}. Change the questions, then send again.`); setYes("failed"); }
      else setYes("live");
      onSaved(current);
    } catch (cause) {
      setFailure(`${cause instanceof Error ? cause.message : "The draft couldn't be sent."} ${owner} sees what was there before.`);
      setSteps(previous => previous.map(step => step.state === "active" ? { ...step, state: "failed" } : step));
      setYes("failed");
    } finally { sending.current = false; }
  }

  const form = components.find(component => component.kind === "form");
  const listView = components.find(component => component.kind === "list");
  const headline = <XaHeadline quiet="A draft, prepared by you.">{title || "Untitled tool"}.</XaHeadline>;

  const story = <>
    {notice}
    <XaBlock label="Questions" id={`${id}-questions`} action={canEdit ? <XaTextLink onClick={addField}>Add a question</XaTextLink> : undefined}>
      <ol className={styles.questions} aria-labelledby={`${id}-questions`}>
        {fields.map((field, index) => <li key={field.id} className={styles.question}>
          <span className={styles.number} aria-hidden="true">{index + 1}</span>
          <div className={styles.questionBody}>
            <input className={styles.inline} aria-label={`Question ${index + 1}`} value={field.label} maxLength={80} required disabled={disabled}
              onChange={event => updateField(field.id, item => ({ ...item, label: event.target.value }))} />
            <div className={styles.questionFacts}>
              <XaSelect compact label={`What question ${index + 1} takes`} value={field.type} disabled={disabled} options={TYPE_OPTIONS}
                onChange={event => updateField(field.id, item => withType(item, event.target.value as Field["type"]))} />
              <button type="button" className={styles.toggle} aria-pressed={field.required} disabled={disabled} onClick={() => updateField(field.id, item => ({ ...item, required: !item.required }))}>{field.required ? "Required" : "Optional"}</button>
              {listView ? <button type="button" className={styles.toggle} aria-pressed={listView.fields.includes(field.id)} disabled={disabled} onClick={() => toggleIn("list", field.id)}>{listView.fields.includes(field.id) ? "In the list" : "Not in the list"}</button> : null}
              {form && !form.fields.includes(field.id) ? <button type="button" className={styles.toggle} aria-pressed={false} disabled={disabled} onClick={() => toggleIn("form", field.id)}>Not on the form</button> : null}
              {canEdit ? <XaTextLink onClick={() => removeField(field.id)} aria-label={`Remove question ${index + 1}, ${field.label}`}>Remove</XaTextLink> : null}
            </div>
            {field.type === "select" ? <input className={styles.options} aria-label={`Choices for question ${index + 1}, separated by commas`} value={field.options.join(", ")} disabled={disabled}
              onChange={event => updateField(field.id, item => item.type === "select" ? { ...item, options: event.target.value.split(",").map(option => option.trimStart()).filter((option, at, all) => option || at === all.length - 1) } : item)}
              onBlur={() => updateField(field.id, item => item.type === "select" ? { ...item, options: [...new Set(item.options.map(option => option.trim()).filter(Boolean))].slice(0, 20) } : item)} /> : null}
          </div>
        </li>)}
      </ol>
      {editError ? <XaNote tone="down" role="alert">{editError}</XaNote> : null}
    </XaBlock>
    <XaBlock label="Name" id={`${id}-name`}>
      <input className={styles.inline} aria-labelledby={`${id}-name`} value={title} maxLength={160} required disabled={disabled} onChange={event => edit(() => setTitle(event.target.value))} />
    </XaBlock>
    <XaNote>Maintained by {context.personName}, {context.agencyName} · Started {shortDate(value.createdAt)}{until ? ` · You can edit until ${until}` : ""}</XaNote>
  </>;

  const status = !dirty && sent ? <XaStatus kind="waits">Waiting on {owner}</XaStatus>
    : failed.length ? <XaStatus kind="down">{count(failed.length, "check", "checks")} didn&apos;t pass</XaStatus>
      : <XaStatus kind="draft">Draft{sentences.length ? ` · ${count(sentences.length, "change", "changes")}` : ""}</XaStatus>;
  const object = <XaDecision label={`${title}, as ${context.businessName}'s team will see it`} status={status} meta={`${context.businessName} · Internal tool`}
    yes={canEdit ? <XaYes state={yes} block={false} yesLabel={`Send to ${owner}`} notYetLabel="Keep editing" onNotYet={yes === "failed" ? () => setYes("waiting") : undefined}
      onYes={() => void send()} working={{ title: `Sending to ${owner}`, steps }} failure={failure}
      liveLabel={`Sent to ${owner}. Nothing changes until ${owner} makes it live.`}
      disabledReason={!dirty && sent ? `${owner} has this draft. Change something to send it again.` : !title.trim() || fields.some(field => !field.label.trim()) ? "Every question needs words before it can be sent." : undefined}
      unblock={<XaTextLink href={`#${id}-name`}>{!dirty && sent ? "Change the draft" : "Fill in the empty words"}</XaTextLink>} />
      : <XaNote tone="waits">{context.businessName} hasn&apos;t opened this draft to you, or the permission ended. You can read it; you can&apos;t send it.</XaNote>}>
    <div className={styles.preview}>
      <ApplicationUseRenderer presentation="preview" snapshot={applicationPreviewSnapshot(spec)} draft={previewDraft} onDraftChange={setPreviewDraft}
        onSubmit={() => setPreviewDraft({ values: {}, recordId: `${id}-p`, idempotencyKey: `${id}-p` })} />
    </div>
    {sentences.length ? <ul className={styles.sentences} aria-label="What changes">{sentences.map(sentence => <li key={sentence}>{sentence}</li>)}</ul>
      : <XaNote>Nothing changed yet. Edit a question on the left; this side shows it the way {context.businessName}&apos;s team will.</XaNote>}
    <p className={styles.after}>{owner} sees this on Home with the tool beside it. Nothing changes until {owner} says yes.</p>
  </XaDecision>;

  return <XaObjectPage label={`${title} draft for ${context.businessName}`} wide phone="object-first" head={<>{crumbs}{headline}</>} story={story} object={object} />;
}
