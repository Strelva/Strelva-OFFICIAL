"use client";

import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import { z } from "zod";
import { StSkeleton } from "@/components/ui/strelva/Kit";
import { ArrowDown, ArrowUp } from "lucide-react";
import { XaAnswers, XaButton, XaEmpty, XaHeadline, XaIconButton, XaSays, XaTextLink } from "@/components/ui/strelva/Xa";
import { AgencySendPanel, type AgencyDraftChange } from "@/experience/workspace/agency/xa/AgencySendPanel";
import { AgencyFold } from "@/experience/workspace/agency/xa/AgencyFold";
import { dayAndClockLabel } from "@/experience/workspace/agency/xa/agency-xa-model";
import xa from "@/experience/workspace/agency/xa/agency-xa.module.css";
import { SelectInput, TextArea } from "@/components/ui/TextInput";
import { agencyManagedWebsiteDraftGrantSchema, type AgencyManagedWebsiteDraftGrant } from "@/platform/offerings/agency-website-draft-contracts";
import { AGENCY_DOCUMENT_NODE_SECTIONS, siteDocumentSchema, websiteRebuildSchema, type WebsiteRebuildRecord, type CatalogNode } from "@/products/websites/client";
import { AgencyManagedWebsiteDraftExperience } from "./AgencyManagedWebsiteDraftExperience";

export interface AgencyDocumentState { grant: AgencyManagedWebsiteDraftGrant | null; website: WebsiteRebuildRecord | null; section: string | null; sections: string[]; previewHtml?: string; previewHref?: string; previewPages?: Record<string,string> }
export interface AgencyDocumentPatch { op: "replace"; path: string; value: unknown }
export interface AgencyDocumentTransport {
  read(bindingId: string, signal?: AbortSignal, section?: string): Promise<AgencyDocumentState>;
  save(bindingId: string, website: WebsiteRebuildRecord, section: string, ops: AgencyDocumentPatch[]): Promise<{ website: WebsiteRebuildRecord; previewHtml?: string; previewHref?: string; previewPages?: Record<string,string> }>;
}
const recordSchema = z.object({ workId: z.string(), workspaceId: z.string(), rebuild: websiteRebuildSchema });
export class AgencyDocumentTransportError extends Error {
  constructor(message: string, readonly status: number, readonly requiresPermissionReload = [401,403].includes(status)) { super(message); }
}
const previewFields = { previewHtml: z.string().nullable().optional(), previewHref: z.string().nullable().optional() };
const readEnvelopeSchema = z.object({ grant: agencyManagedWebsiteDraftGrantSchema.nullable(), website: recordSchema.nullable(), section: z.string().nullable(), sections: z.array(z.string()).default([]), ...previewFields });
const saveEnvelopeSchema = z.object({ website: recordSchema, ...previewFields });
function validEnvelope<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new AgencyDocumentTransportError("The website response was incomplete. Reload the saved document and permission before saving again.",502,true);
  return parsed.data;
}
async function json(response: Response): Promise<unknown> {
  if (response.redirected) {
    let signIn = false;
    try { const path = new URL(response.url).pathname; signIn = path === "/sign-in" || path.startsWith("/sign-in/"); } catch { /* Any unexpected redirect still requires a fresh permission read. */ }
    throw new AgencyDocumentTransportError(signIn ? "Your sign-in session is no longer available. Sign in again, then reload the saved document and permission. Your unsaved edits are preserved." : "The website request was redirected. Reload the saved document and permission before saving again.",signIn ? 401 : 502,true);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "The assigned website draft could not be opened. Reload permission and try again.";
    throw new AgencyDocumentTransportError(message,response.status);
  }
  if (!/^(?:application\/json|application\/[a-z0-9.+-]+\+json)(?:\s*;|$)/i.test(response.headers.get("Content-Type") ?? "") || !body || typeof body !== "object" || Array.isArray(body)) throw new AgencyDocumentTransportError("The website returned an unreadable response. Reload the saved document and permission before saving again.",502,true);
  return body;
}
export const agencyDocumentTransport: AgencyDocumentTransport = {
  async read(bindingId, signal, section) {
    const body = validEnvelope(readEnvelopeSchema,await json(await fetch(`/api/agency-website-draft-access?${new URLSearchParams({ bindingId, document: "1", ...(section ? { section } : {}) })}`, { signal, cache: "no-store", credentials: "same-origin" })));
    return { grant: body.grant ? agencyManagedWebsiteDraftGrantSchema.parse(body.grant) : null, website: body.website ? recordSchema.parse(body.website) : null, section: typeof body.section === "string" ? body.section : null, sections: z.array(z.string()).parse(body.sections ?? []), ...(typeof body.previewHtml === "string" ? { previewHtml: body.previewHtml } : {}), ...(typeof body.previewHref === "string" ? { previewHref: body.previewHref } : {}) };
  },
  async save(bindingId, website, section, ops) {
    const candidate = website.rebuild.candidate!;
    const body = validEnvelope(saveEnvelopeSchema,await json(await fetch("/api/agency-website-draft-access", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prepare_document", bindingId, section, websiteWorkId: website.workId, expectedRevision: website.rebuild.revision, candidateRevision: candidate.revision, candidateContentHash: candidate.contentHash, ops }) })));
    return { website: recordSchema.parse(body.website), ...(typeof body.previewHtml === "string" ? { previewHtml: body.previewHtml } : {}), ...(typeof body.previewHref === "string" ? { previewHref: body.previewHref } : {}) };
  },
};
export function agencyEditableNodes(nodes: Record<string, CatalogNode>, section: string | null) {
  return Object.values(nodes).filter(node => AGENCY_DOCUMENT_NODE_SECTIONS[node.type] === section && !["Header", "Footer"].includes(node.type));
}
const pointer = (id: string) => id.replace(/~/g, "~0").replace(/\//g, "~1");
function object(value: string): Record<string, unknown> | null { try { const parsed: unknown = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null; } catch { return null; } }
type Edit = { props: string; children: string[] };

export function AgencyWebsiteDocumentDraftExperience({ bindingId, transport = agencyDocumentTransport, clientName, initialEdits }: { bindingId: string; transport?: AgencyDocumentTransport; clientName?: string; /** Preview fixtures only: edits already made, so the send panel can be seen filled. */ initialEdits?: Record<string, Edit> }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<AgencyDocumentState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [permissionChecked, setPermissionChecked] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [selected, setSelected] = useState("");
  const [scope, setScope] = useState<string | undefined>();
  const [page, setPage] = useState("/");
  const [previewError, setPreviewError] = useState(false);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("");
    transport.read(bindingId, controller.signal, scope).then(value => { if (!controller.signal.aborted) { setState(value); setPermissionChecked(true); setEdits(initialEdits ?? {}); setSelected(""); setSaved(""); setLoading(false); } }).catch(cause => { if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : "Permission could not be checked."); setPermissionChecked(false); setLoading(false); } });
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- initialEdits seeds the first read only.
  }, [bindingId, transport, attempt, scope]);
  useEffect(() => { const tick = () => setNow(Date.now()); tick(); const timer = window.setInterval(tick, 1000); return () => window.clearInterval(timer); }, []);
  const website = state?.website;
  const candidate = website?.rebuild.candidate;
  const nodes = useMemo(() => candidate ? agencyEditableNodes(candidate.document.nodes, state?.section ?? null) : [], [candidate, state?.section]);
  // Open on the section that holds the pending changes, so the brief and the send panel agree.
  const node = nodes.find(item => item.id === selected) ?? nodes.find(item => edits[item.id]) ?? nodes[0];
  const edit = node ? edits[node.id] ?? { props: JSON.stringify(node.props, null, 2), children: node.children } : null;
  const props = edit ? object(edit.props) : null;
  const active = Boolean(permissionChecked && state?.grant?.status === "active" && now !== null && Date.parse(state.grant.expiresAt) > now);
  const previewHref = useMemo(() => {
    if (!state?.previewHref) return undefined;
    const [path,search] = state.previewHref.split("?"); const params = new URLSearchParams(search); params.set("page",page); return `${path}?${params}`;
  }, [state?.previewHref,page]);
  useEffect(() => { setPreviewError(false); }, [previewHref,candidate?.contentHash,page]);
  function checkPreview(event: SyntheticEvent<HTMLIFrameElement>) {
    try { const hash = event.currentTarget.contentDocument?.querySelector('meta[name="strelva-site-hash"]')?.getAttribute("content"); setPreviewError(hash !== candidate?.contentHash); } catch { setPreviewError(true); }
  }
  function update(next: Partial<Edit>) { if (node && edit) { setEdits(values => ({ ...values, [node.id]: { ...edit, ...next } })); setSaved(""); } }
  function field(key: string, value: string) { if (props) update({ props: JSON.stringify({ ...props, [key]: value }, null, 2) }); }
  const ops = useMemo(() => {
    const values: AgencyDocumentPatch[] = [];
    for (const [id, value] of Object.entries(edits)) {
      const original = candidate?.document.nodes[id]; const parsed = object(value.props);
      if (!original || !parsed) return null;
      if (JSON.stringify(parsed) !== JSON.stringify(original.props)) values.push({ op: "replace", path: `/nodes/${pointer(id)}/props`, value: parsed });
      if (JSON.stringify(value.children) !== JSON.stringify(original.children)) values.push({ op: "replace", path: `/nodes/${pointer(id)}/children`, value: value.children });
    }
    return values;
  }, [edits, candidate]);
  async function save() {
    if (!website || !candidate || !active || !ops?.length) return;
    const document = structuredClone(candidate.document);
    for (const [id, value] of Object.entries(edits)) { document.nodes[id]!.props = object(value.props) as CatalogNode["props"]; document.nodes[id]!.children = value.children; }
    if (!siteDocumentSchema.safeParse(document).success) { setError("The section settings do not match this website component. Correct the settings before saving."); return; }
    setSaving(true); setError(""); setSaved("");
    try { const result = await transport.save(bindingId, website, state!.section!, ops); setState(current => current ? { ...current, ...result } : current); setEdits({}); setSaved(`Sent to ${clientName || "the client"}. ${clientName || "The client"} can now review it.`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The draft could not be saved. Your edits are preserved."); if (cause instanceof AgencyDocumentTransportError && cause.requiresPermissionReload) setPermissionChecked(false); }
    finally { setSaving(false); }
  }
  if (!loading && state && !website && !error) return <AgencyManagedWebsiteDraftExperience bindingId={bindingId} />;
  const client = clientName || "the client";
  const changes = draftChanges(edits, candidate?.document.nodes);
  const changedNode = Object.keys(edits).map(id => candidate?.document.nodes[id]).find(item => item && changes.some(change => change.id.startsWith(`${item.id}:`)));
  const pageName = sectionTitle(changedNode ?? node) ?? sectionWord(state?.section ?? null);
  const changedTitle = changedNode ? sectionTitle({ ...changedNode, props: (object(edits[changedNode.id]!.props) ?? changedNode.props) as CatalogNode["props"] } as CatalogNode) : null;
  const keepEditing = () => { setSaved(""); const target = editorRef.current; const still = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches; target?.scrollIntoView?.({ block: "start", behavior: still ? "auto" : "smooth" }); target?.querySelector<HTMLElement>("select, textarea")?.focus({ preventScroll: true }); };
  const editor = node && edit ? <div className={xa.editor} ref={editorRef}>
    <SelectInput label="Section to edit" value={node.id} onChange={event => setSelected(event.target.value)} options={nodes.map(item => ({ value: item.id, label: sectionTitle(item) ?? typeLabel(item.type) }))} disabled={saving} />
    {Object.entries(props ?? {}).filter(([,value]) => typeof value === "string").map(([key,value]) => <TextArea key={key} label={fieldLabel(key)} value={String(value)} rows={key === "body" || key === "text" ? 4 : 2} onChange={event => field(key, event.target.value)} disabled={saving} />)}
    {edit.children.length > 1 ? <AgencyFold label="Section order" count={edit.children.length}>
      <ol className={xa.order} aria-label="Section order">{edit.children.map((id, index) => {
        const name = sectionTitle(candidate!.document.nodes[id]) ?? typeLabel(candidate!.document.nodes[id]?.type ?? "Section");
        const move = (direction: number) => { const children = [...edit.children]; const target = index + direction; [children[index], children[target]] = [children[target]!, children[index]!]; update({ children }); };
        return <li key={id}><span>{name}</span>
          <XaIconButton tone="plain" label={`Move ${name} up`} disabled={saving || index === 0} onClick={() => move(-1)}><ArrowUp size={16} aria-hidden="true" /></XaIconButton>
          <XaIconButton tone="plain" label={`Move ${name} down`} disabled={saving || index === edit.children.length - 1} onClick={() => move(1)}><ArrowDown size={16} aria-hidden="true" /></XaIconButton>
        </li>;
      })}</ol>
    </AgencyFold> : null}
    <AgencyFold label="Section settings"><TextArea label="Component settings" value={edit.props} onChange={event => update({ props: event.target.value })} rows={8} spellCheck={false} disabled={saving} helperText="Use the settings already supported by this component. Facts and verification are managed by the client’s review." />{!props ? <p role="alert" className={xa.inlineAlert}>Settings must be a valid JSON object.</p> : null}</AgencyFold>
  </div> : null;
  return <main className="min-h-screen" style={{ background: "var(--st-canvas, #faf9f6)" }}>
    {loading ? <div className={xa.state}><StSkeleton label="Checking the current website permission" width="65%" /></div> : null}
    {error ? <div className={xa.state}><XaSays links={[<XaTextLink key="reload" onClick={saving ? undefined : () => setAttempt(value => value + 1)}>Reload saved document and permission</XaTextLink>]}><span role="alert">{error}{Object.keys(edits).length ? " Your unsaved edits are preserved. Reloading replaces them with the saved document." : ""}</span></XaSays></div> : null}
    {!loading && state && !state.grant ? <div className={xa.state}><XaEmpty pose="resting" size="sm" job={`Pebble opens this page for you the moment ${client} turns on draft editing.`} title={`${clientName || "The client"} needs to turn on draft editing first.`} /></div> : null}
    {!loading && state?.grant && !active ? <div className={xa.state}><XaSays>This draft permission is {!permissionChecked ? "unconfirmed" : state.grant.status === "revoked" ? "revoked" : "expired"}. Sending is unavailable. Website history stays with {client}.</XaSays></div> : null}
    {!loading && candidate && state?.grant && active ? <div className={xa.prepare}>
      <div className={xa.prepareBrief}>
        <nav aria-label="Breadcrumb"><ol className={xa.crumbs}>{clientName ? <li>{clientName}</li> : null}<li>Website</li><li aria-current="page">{pageName}</li></ol></nav>
        <XaHeadline quiet={changes.length ? "A draft, prepared by you." : "Nothing changed yet."}>{changedTitle ?? pageName}.</XaHeadline>
        <XaAnswers labelWidth={120} rows={[
          ["Changes", changes.length ? `${changes.length} ${changes.length === 1 ? "line" : "lines"} on ${pageName}` : "Nothing edited yet"],
          ["Website", `Prepare. ${clientName || "The client"} puts it live.`],
          ["Your access", `You can edit this page until ${dayAndClockLabel(state.grant.expiresAt)}.`],
        ]} />
        {state.sections.length > 1 ? <SelectInput label="Part of the site you can edit" value={state.section ?? ""} options={state.sections.map(value => ({ value, label: sectionWord(value) }))} onChange={event => setScope(event.target.value)} disabled={saving || Object.keys(edits).length > 0} helperText={Object.keys(edits).length > 0 ? "Send or reload your edits before changing the part you edit." : undefined} /> : null}
      </div>
      {editor ? <div className={xa.prepareSide}><AgencySendPanel clientName={clientName || "the client"} address={previewAddress(state.previewHref, page, `${website!.rebuild.title} · ${pageName}`)} changes={changes} sending={saving}
        blocked={ops === null ? "One section's settings aren't valid. Fix them before sending." : null}
        sent={saved && !changes.length ? saved : undefined}
        onSend={() => void save()} onKeepEditing={keepEditing} /></div> : null}
      <div className={xa.prepareEditor}>
        {editor ?? <p className={xa.note}>{state.section === "navigation" || state.section === "footer" ? "Navigation and footer changes need the client or Strelva to prepare them. This agency permission does not allow saving those sections." : "No editable sections match this permission."}</p>}
        <AgencyFold label={`The saved page, as ${client} will see it`}><p className={xa.note}>The preview updates after you send. Forms are disabled.</p><SelectInput label="Preview page" value={page} options={candidate.document.pages.map(item => ({value:item.path,label:item.title}))} onChange={event => setPage(event.target.value)} />{previewError ? <div role="alert" className={xa.inlineAlert}><p>The private preview is unavailable or no longer matches this candidate. Reload saved document and permission before relying on it.</p>{Object.keys(edits).length ? <p className={xa.note}>Reloading replaces your unsaved edits with the saved document.</p> : null}<XaButton disabled={saving} onClick={() => setAttempt(value => value + 1)}>Reload preview and permission</XaButton></div> : null}{previewHref || state.previewHtml || state.previewPages ? <iframe key={`${candidate.contentHash}:${page}`} title="Saved agency website draft preview" className={xa.preview} sandbox="allow-same-origin" src={previewHref} srcDoc={previewHref ? undefined : state.previewPages?.[page] ?? state.previewHtml} onLoad={checkPreview} /> : <p role="status" className={xa.note}>Saved preview is unavailable. Your draft can still be sent for review.</p>}</AgencyFold>
      </div>
    </div> : null}
    {!loading && state?.website && !candidate ? <div className={xa.state}><XaEmpty pose="resting" size="sm" job="Pebble opens the draft here as soon as one is prepared." title="This website has no draft yet.">The client or Strelva needs to prepare one first.</XaEmpty></div> : null}
  </main>;
}

/** "services" → "Services": the assigned part of the site, as a word. */
function sectionWord(section: string | null): string { return section ? section.charAt(0).toUpperCase() + section.slice(1) : "This page"; }
/** "ServiceGrid" → "Service grid": component names read as words. */
function typeLabel(type: string): string { const words = type.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase(); return words.charAt(0).toUpperCase() + words.slice(1); }
function fieldLabel(key: string): string { return key.replace(/([A-Z])/g, " $1").replace(/^./, character => character.toUpperCase()); }
function sectionTitle(node: CatalogNode | undefined): string | null { return node && "title" in node.props && typeof node.props.title === "string" ? node.props.title : null; }
function previewAddress(href: string | undefined, page: string, fallback: string): string { return href ? page : fallback; }

/** Sentences or lines of a text field, so a long body diffs line by line. */
function segments(text: string): string[] {
  return text.split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9])/).map(part => part.trim()).filter(Boolean);
}

/** Pairs what changed between two texts, line by line; unchanged lines stay out. */
export function lineChanges(before: string, after: string): { before: string; after: string }[] {
  const a = segments(before), b = segments(after);
  if (a.length <= 1 && b.length <= 1) return [{ before, after }];
  const table = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) table[i]![j] = a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
  const rows: { before: string; after: string }[] = [];
  let removed: string[] = [], added: string[] = [];
  const flush = () => { for (let k = 0; k < Math.max(removed.length, added.length); k++) rows.push({ before: removed[k] ?? "", after: added[k] ?? "" }); removed = []; added = []; };
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { flush(); i++; j++; }
    else if (j < b.length && (i >= a.length || table[i]![j + 1]! >= table[i + 1]![j]!)) added.push(b[j++]!);
    else removed.push(a[i++]!);
  }
  flush();
  return rows;
}

/** Each changed text line and any reordering, as now and after, for the send panel. */
export function draftChanges(edits: Record<string, { props: string; children: string[] }>, nodes: Record<string, CatalogNode> | undefined): AgencyDraftChange[] {
  if (!nodes) return [];
  const rows: AgencyDraftChange[] = [];
  const many = Object.keys(edits).length > 1;
  for (const [id, value] of Object.entries(edits)) {
    const original = nodes[id]; const parsed = object(value.props);
    if (!original) continue;
    const name = sectionTitle(original) ?? typeLabel(original.type);
    const prefix = many ? `${name} · ` : "";
    if (parsed) for (const [key, after] of Object.entries(parsed)) {
      const before = (original.props as Record<string, unknown>)[key];
      if (typeof after !== "string" || after === before) continue;
      const part = key === "title" ? "Heading" : key === "body" || key === "text" ? "Text" : fieldLabel(key);
      lineChanges(typeof before === "string" ? before : "", after).forEach((line, index) => rows.push({ id: `${id}:${key}:${index}`, label: `${prefix}${part}`, before: line.before, after: line.after }));
    }
    if (JSON.stringify(value.children) !== JSON.stringify(original.children)) rows.push({ id: `${id}:order`, label: `${prefix}Order`, before: original.children.map(child => sectionTitle(nodes[child]) ?? typeLabel(nodes[child]?.type ?? "Section")).join(", "), after: value.children.map(child => sectionTitle(nodes[child]) ?? typeLabel(nodes[child]?.type ?? "Section")).join(", ") });
  }
  return rows;
}
