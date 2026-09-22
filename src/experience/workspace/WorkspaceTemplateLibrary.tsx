"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, LayoutGrid, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { ApplicationDraftEditor } from "@/experience/applications/ApplicationDraftEditor";
import { ApplicationDraftPreview } from "@/experience/applications/ApplicationDraftPreview";
import { APP_TEMPLATES, templateDraft, validateApplicationDraft, type AppTemplate, type ApplicationDraftSpec } from "@/experience/applications/app-templates";
import { useWorkspaceRequest } from "./WorkspaceRequest";
import styles from "./template-library.module.css";

export interface WorkspaceTemplateLibraryProps {
  workspaceId: string;
  actorEmail: string;
  businessName: string;
  canCreate: boolean;
  onCreated?: (workId: string) => void;
  onRequest: (request: string) => void;
}

const savedApplicationSchema = z.object({ id: z.string().uuid(), workspaceId: z.string().uuid(), productId: z.literal("applications") });
const storedFieldBase = { id: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/), label: z.string().max(80), required: z.boolean() };
const storedSpecSchema = z.object({ title: z.string().max(160), maintenanceOwner: z.string(), fields: z.array(z.discriminatedUnion("type", [z.object({ ...storedFieldBase, type: z.enum(["text", "number", "date", "boolean"]) }), z.object({ ...storedFieldBase, type: z.literal("select"), options: z.array(z.string().max(80)).max(20) })])).min(1).max(30), components: z.array(z.object({ kind: z.enum(["form", "list", "detail", "document"]), fields: z.array(z.string()).min(1).max(30) })).min(1).max(12) });
const storedSchema = z.object({ version: z.literal(1), spec: storedSpecSchema, state: z.enum(["editing", "unconfirmed", "created"]), workId: z.string().uuid().optional() });
const categories = ["All", "Team", "Operations", "Customers"] as const;

function selectedTemplate(): AppTemplate | null {
  if (typeof window === "undefined") return null;
  const id = new URLSearchParams(window.location.search).get("template");
  return APP_TEMPLATES.find(template => template.id === id) ?? null;
}

/** Native app creation only. Public access and publication remain separate actions. */
export function WorkspaceTemplateLibrary(props: WorkspaceTemplateLibraryProps) {
  const [selected, setSelected] = useState<AppTemplate | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof categories)[number]>("All");
  const heading = useRef<HTMLHeadingElement>(null);
  const listTrigger = useRef<string | null>(null);
  useEffect(() => {
    const restore = () => setSelected(selectedTemplate());
    const frame = window.requestAnimationFrame(restore);
    window.addEventListener("popstate", restore);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("popstate", restore); };
  }, []);
  useEffect(() => { if (selected) heading.current?.focus({ preventScroll: true }); }, [selected]);
  function select(template: AppTemplate | null) {
    setSelected(template);
    const url = new URL(window.location.href);
    if (template) {
      listTrigger.current = template.id;
      url.searchParams.set("template", template.id);
    } else url.searchParams.delete("template");
    window.history.pushState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    if (!template) window.requestAnimationFrame(() => document.getElementById(`template-${listTrigger.current}`)?.focus());
  }
  if (selected) return <div className={styles.library}>
    <Button variant="ghost" onClick={() => select(null)}><ArrowLeft size={16} aria-hidden="true" />All apps &amp; templates</Button>
    <header className={styles.heading}><p>{props.businessName} · Private app</p><h2 ref={heading} tabIndex={-1}>{selected.name}</h2><p>{selected.description}</p></header>
    <TemplateSession key={`${props.actorEmail}:${props.workspaceId}:${selected.id}`} {...props} template={selected} />
  </div>;
  const normalized = query.trim().toLocaleLowerCase();
  const visible = APP_TEMPLATES.filter(template => (category === "All" || template.category === category) && `${template.name} ${template.description}`.toLocaleLowerCase().includes(normalized));
  return <section className={styles.library} aria-labelledby="template-library-title">
    <header className={styles.heading}><p>{props.businessName}</p><h1 id="template-library-title">Make it yours.</h1><p>Start with a working app. Adjust the fields, try it, then save a private copy to your business.</p></header>
    <div className={styles.filterbar}>
      <label className={styles.search}><Search size={18} aria-hidden="true" /><span className="sr-only">Search app templates</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find an app template…" /></label>
      <div className={styles.categories} aria-label="Template categories">{categories.map(item => <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div>
    </div>
    <p className={styles.resultCount} role="status">{visible.length} {visible.length === 1 ? "template" : "templates"}</p>
    <div className={styles.grid}>{visible.map(template => <button type="button" id={`template-${template.id}`} key={template.id} className={styles.template} onClick={() => select(template)} aria-label={`Preview ${template.name}`}>
      <div className={styles.templateTop}><LayoutGrid size={20} aria-hidden="true" /><span>{template.category}</span></div>
      <h2>{template.name}</h2><p>{template.description}</p>
      <div className={styles.fieldPreview} aria-hidden="true">{template.fields.slice(0, 3).map(field => <span key={field.id}>{field.label}<i /></span>)}</div>
      <span className={styles.open}>Preview &amp; customize<ArrowRight size={16} aria-hidden="true" /></span>
    </button>)}</div>
    {!visible.length ? <div className={styles.empty}><h2>No matching templates</h2><p>Try another search, or describe the app you need.</p><Button variant="secondary" onClick={() => { setQuery(""); setCategory("All"); }}>Clear filters</Button></div> : null}
    <div className={styles.custom}><div><h2>Need a different starting point?</h2><p>Describe the work. Review a proposed app before anything is created.</p></div><Button variant="secondary" disabled={!props.canCreate} onClick={() => props.onRequest("Create a private application for our business.")}>Describe an app<ArrowRight size={16} aria-hidden="true" /></Button></div>
  </section>;
}

function TemplateSession({ workspaceId, actorEmail, businessName, canCreate, onCreated, template }: WorkspaceTemplateLibraryProps & { template: AppTemplate }) {
  const transport = useWorkspaceRequest();
  const [draft, setDraft] = useState<ApplicationDraftSpec>(() => templateDraft(template));
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<"editing" | "unconfirmed" | "created">("editing");
  const [workId, setWorkId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [checkedSavedWork, setCheckedSavedWork] = useState(false);
  const [error, setError] = useState("");
  const mutation = useRef(false);
  const mounted = useRef(true);
  const storageKey = `strelva:template-draft:v1:${encodeURIComponent(actorEmail.toLowerCase())}:${workspaceId}:${template.id}`;
  useEffect(() => {
    mounted.current = true;
    // Browser state is a proposal only; every create still passes native server checks.
    const frame = window.requestAnimationFrame(() => {
      try {
        const raw = window.sessionStorage.getItem(storageKey);
        const saved = raw && raw.length < 40_000 ? storedSchema.safeParse(JSON.parse(raw)) : null;
        if (saved?.success) {
          const { maintenanceOwner: _owner, ...spec } = saved.data.spec;
          setDraft(spec); setState(saved.data.state); setWorkId(saved.data.workId);
        }
      } catch { /* An unsaved editor is still usable without browser storage. */ }
      setReady(true);
    });
    return () => { mounted.current = false; window.cancelAnimationFrame(frame); };
  }, [storageKey]);

  function remember(spec: ApplicationDraftSpec, nextState: typeof state, savedId?: string): boolean {
    try { window.sessionStorage.setItem(storageKey, JSON.stringify({ version: 1, spec: { ...spec, maintenanceOwner: "assigned-by-server" }, state: nextState, workId: savedId })); return true; }
    catch { return false; }
  }
  function edit(spec: ApplicationDraftSpec) {
    setDraft(spec); setError("");
    if (!remember(spec, "editing")) setError("Your changes are available in this tab, but browser storage is unavailable. Allow session storage before saving the app.");
  }
  const invalid = validateApplicationDraft(draft);
  const workHref = `/workspace?workspaceId=${encodeURIComponent(workspaceId)}&view=work`;
  function openCreated(id: string) {
    if (onCreated) onCreated(id);
  }
  function startAnother() {
    if (busy || mutation.current) return;
    const fresh = templateDraft(template);
    setDraft(fresh);
    setState("editing");
    setWorkId(undefined);
    setCheckedSavedWork(false);
    setError("");
    if (!remember(fresh, "editing")) {
      setError("Your new draft is open, but browser storage is unavailable. Keep this tab open until you save.");
    }
  }
  async function create() {
    if (!ready || !canCreate || invalid || mutation.current || state !== "editing") return;
    if (!remember(draft, "unconfirmed")) { setError("Allow session storage before saving. Nothing was sent."); return; }
    mutation.current = true; setBusy(true); setError(""); setState("unconfirmed");
    try {
      const response = await transport("/api/bounded-work", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ action: "create", productId: "applications", workspaceId, input: draft }) });
      const body: unknown = await response.json().catch(() => null);
      if (!mounted.current) return;
      if (!response.ok) {
        // This existing create endpoint has no idempotency contract. Never blindly retry an ambiguous write.
        if (response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status)) { setState("editing"); remember(draft, "editing"); }
        const detail = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "The app could not be confirmed.";
        throw new Error(detail);
      }
      const result = savedApplicationSchema.safeParse(body);
      if (!result.success || result.data.workspaceId !== workspaceId) throw new Error("The app returned an unconfirmed result.");
      remember(draft, "created", result.data.id); setWorkId(result.data.id); setState("created");
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "The app could not be confirmed. Check saved work before creating another copy."); }
    finally { mutation.current = false; if (mounted.current) setBusy(false); }
  }
  if (!ready) return <p role="status">Opening your template…</p>;
  return <>
    <div className={styles.editorGrid}><ApplicationDraftEditor value={draft} onChange={edit} disabled={busy || state !== "editing" || !canCreate} /><div className={styles.preview}>{invalid ? <p role="status" className={styles.notice}>Complete the field names and choices to try this app.</p> : <ApplicationDraftPreview spec={draft} />}</div></div>
    <div className={styles.savebar}>
      <div><strong>{state === "created" ? "Your private app is ready." : `Save to ${businessName}`}</strong><p>{state === "created" ? "Open it to check, publish, and choose who can use it." : "Starts with no records. Nothing is published or shared."}</p></div>
      {state === "created" && workId ? <div className={styles.saveActions}>{onCreated ? <Button onClick={() => openCreated(workId)}>Open app<ArrowRight size={16} /></Button> : <Link className={styles.openApp} href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}&view=applications&work=${encodeURIComponent(workId)}`}>Open app<ArrowRight size={16} /></Link>}<Button type="button" variant="secondary" onClick={startAnother}>Start another app</Button></div> : <Button onClick={() => void create()} loading={busy} disabled={!canCreate || Boolean(invalid) || state !== "editing"}>Create private app</Button>}
    </div>
    {!canCreate ? <p role="status" className={styles.notice}>Choose an editable workspace with applications enabled to create this app. The preview is still available.</p> : null}
    {invalid && state === "editing" ? <p role="status" className={styles.notice}>Check the proposed fields: {invalid}</p> : null}
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    {state === "unconfirmed" && !busy ? <div role="status" className={styles.notice}><strong>Check whether the app was saved.</strong><p>Your draft is retained. This attempt is not automatically repeated because it could create another app.</p><a href={workHref} target="_blank" rel="noreferrer">Open saved work in another tab</a><label className="mt-4 flex min-h-11 items-center gap-3"><input type="checkbox" checked={checkedSavedWork} onChange={event => setCheckedSavedWork(event.target.checked)} />I checked saved work and need another attempt.</label><p>A new attempt may create another copy if the first save completed.</p><Button type="button" variant="secondary" disabled={!canCreate || !checkedSavedWork} onClick={() => { if (!checkedSavedWork || !canCreate) return; remember(draft, "editing"); setState("editing"); setError(""); setCheckedSavedWork(false); }}>Allow a new attempt</Button></div> : null}
  </>;
}
