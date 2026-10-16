"use client";

import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import { z } from "zod";
import { StSkeleton } from "@/components/ui/strelva/Kit";
import { XaAnswers, XaButton, XaEmpty, XaHeadline, XaLabel, XaRow, XaRows, XaSays, XaTextLink } from "@/components/ui/strelva/Xa";
import { AgencySendPanel, type AgencyDraftChange } from "@/experience/workspace/agency/xa/AgencySendPanel";
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
  const node = nodes.find(item => item.id === selected) ?? nodes[0];
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
    try { const result = await transport.save(bindingId, website, state!.section!, ops); setState(current => current ? { ...current, ...result } : current); setEdits({}); setSaved(`Sent as draft Release ${result.website.rebuild.candidate?.revision}. ${clientName || "The client"} can now review it.`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The draft could not be saved. Your edits are preserved."); if (cause instanceof AgencyDocumentTransportError && cause.requiresPermissionReload) setPermissionChecked(false); }
    finally { setSaving(false); }
  }
  if (!loading && state && !website && !error) return <AgencyManagedWebsiteDraftExperience bindingId={bindingId} />;
  const client = clientName || "the client";
  const changes = draftChanges(edits, candidate?.document.nodes);
  const editor = node && edit ? <div className={xa.editor} ref={editorRef}>
    <SelectInput label="Section to edit" value={node.id} onChange={event => setSelected(event.target.value)} options={nodes.map(item => ({ value: item.id, label: `${typeLabel(item.type)} · ${"title" in item.props && typeof item.props.title === "string" ? item.props.title : "Untitled"}` }))} disabled={saving} />
    {Object.entries(props ?? {}).filter(([,value]) => typeof value === "string").map(([key,value]) => <TextArea key={key} label={fieldLabel(key)} value={String(value)} rows={key === "body" || key === "text" ? 4 : 2} onChange={event => field(key, event.target.value)} disabled={saving} />)}
    {edit.children.length > 1 ? <div><XaLabel as="h3">Section order</XaLabel><XaRows label="Section order">{edit.children.map((id,index) => <XaRow key={id} title={typeLabel(candidate!.document.nodes[id]?.type ?? "Section")} detail={sectionTitle(candidate!.document.nodes[id]) ?? undefined} action={<>{[[-1,"up"],[1,"down"]].map(([direction,label]) => <XaTextLink key={label} aria-label={`Move ${id} ${label}`} onClick={saving || index + Number(direction) < 0 || index + Number(direction) >= edit.children.length ? undefined : () => { const children = [...edit.children]; const target = index + Number(direction); [children[index], children[target]] = [children[target]!, children[index]!]; update({ children }); }}>Move {label}</XaTextLink>)}</>} />)}</XaRows></div> : null}
    <details><summary className="cursor-pointer py-2 text-sm text-gray-muted">Section settings</summary><TextArea label="Component settings" value={edit.props} onChange={event => update({ props: event.target.value })} rows={8} spellCheck={false} disabled={saving} helperText="Use the settings already supported by this component. Facts and verification are managed by the client’s review." />{!props ? <p role="alert" className="mt-2 text-sm text-critical">Settings must be a valid JSON object.</p> : null}</details>
  </div> : null;
  return <main className="min-h-screen" style={{ background: "var(--st-canvas, #faf9f6)" }}>
    {loading ? <div className={xa.state}><StSkeleton label="Checking the current website permission" width="65%" /></div> : null}
    {error ? <div className={xa.state}><XaSays links={[<XaTextLink key="reload" onClick={saving ? undefined : () => setAttempt(value => value + 1)}>Reload saved document and permission</XaTextLink>]}><span role="alert">{error}{Object.keys(edits).length ? " Your unsaved edits are preserved. Reloading replaces them with the saved document." : ""}</span></XaSays></div> : null}
    {!loading && state && !state.grant ? <div className={xa.state}><XaEmpty pose="resting" size="sm" job={`Pebble opens this page for you the moment ${client} turns on draft editing.`} title={`${clientName || "The client"} needs to turn on draft editing first.`} /></div> : null}
    {!loading && state?.grant && !active ? <div className={xa.state}><XaSays>This draft permission is {!permissionChecked ? "unconfirmed" : state.grant.status === "revoked" ? "revoked" : "expired"}. Sending is unavailable. Website history stays with {client}.</XaSays></div> : null}
    {!loading && candidate && state?.grant && active ? <div className={xa.prepare}>
      <div className={xa.prepareBrief}>
        <nav aria-label="Breadcrumb"><ol className={xa.crumbs}>{clientName ? <li>{clientName}</li> : null}<li>Website</li><li aria-current="page">{state.section}</li></ol></nav>
        <XaHeadline quiet="A draft, prepared by you.">{website!.rebuild.title}.</XaHeadline>
        <XaAnswers labelWidth={120} rows={[
          ["Changes", changes.length ? `${changes.length} ${changes.length === 1 ? "line" : "lines"} in ${state.section}` : "Nothing edited yet"],
          ["Website", `Prepare. ${clientName || "The client"} puts it live.`],
          ["Release", `Draft of Release ${candidate.revision}`],
          ["Your access", `${state.section} · until ${new Date(state.grant.expiresAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`],
        ]} />
        {state.sections.length > 1 ? <SelectInput label="Assigned section" value={state.section ?? ""} options={state.sections.map(value => ({ value, label: value }))} onChange={event => setScope(event.target.value)} disabled={saving || Object.keys(edits).length > 0} helperText={Object.keys(edits).length > 0 ? "Send or reload your edits before changing the assigned section." : undefined} /> : null}
        {editor ?? <p className="text-sm text-gray-muted">{state.section === "navigation" || state.section === "footer" ? "Navigation and footer changes need the client or Strelva to prepare them. This agency permission does not allow saving those sections." : "No editable sections match this permission."}</p>}
        <details><summary className="cursor-pointer py-2 text-sm text-gray-muted">The saved page, as {client} will see it</summary><p className="mt-2 text-sm text-gray-muted">The preview updates after you send. Forms are disabled.</p><SelectInput className="mt-4" label="Preview page" value={page} options={candidate.document.pages.map(item => ({value:item.path,label:item.title}))} onChange={event => setPage(event.target.value)} />{previewError ? <div role="alert" className="mt-4 space-y-3 text-sm text-critical"><p>The private preview is unavailable or no longer matches this candidate. Reload saved document and permission before relying on it.</p>{Object.keys(edits).length ? <p className="text-gray-muted">Reloading replaces your unsaved edits with the saved document.</p> : null}<XaButton disabled={saving} onClick={() => setAttempt(value => value + 1)}>Reload preview and permission</XaButton></div> : null}{previewHref || state.previewHtml || state.previewPages ? <iframe key={`${candidate.contentHash}:${page}`} title="Saved agency website draft preview" className={`mt-4 ${xa.preview}`} sandbox="allow-same-origin" src={previewHref} srcDoc={previewHref ? undefined : state.previewPages?.[page] ?? state.previewHtml} onLoad={checkPreview} /> : <p role="status" className="mt-4 text-sm text-gray-muted">Saved preview is unavailable. Your draft can still be sent for review.</p>}</details>
      </div>
      {editor ? <div className={xa.prepareSide}><AgencySendPanel clientName={clientName || "the client"} address={previewAddress(state.previewHref, page, website!.rebuild.title)} changes={changes} sending={saving}
        blocked={ops === null ? "One section's settings aren't valid. Fix them before sending." : null}
        sent={saved && !changes.length ? saved : undefined}
        onSend={() => void save()} onKeepEditing={() => { setSaved(""); editorRef.current?.querySelector<HTMLElement>("select, textarea")?.focus(); }} /></div> : null}
    </div> : null}
    {!loading && state?.website && !candidate ? <div className={xa.state}><XaEmpty pose="resting" size="sm" job="Pebble opens the draft here as soon as one is prepared." title="This website has no draft yet.">The client or Strelva needs to prepare one first.</XaEmpty></div> : null}
  </main>;
}

/** "ServiceGrid" → "Service grid": component names read as words. */
function typeLabel(type: string): string { const words = type.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase(); return words.charAt(0).toUpperCase() + words.slice(1); }
function fieldLabel(key: string): string { return key.replace(/([A-Z])/g, " $1").replace(/^./, character => character.toUpperCase()); }
function sectionTitle(node: CatalogNode | undefined): string | null { return node && "title" in node.props && typeof node.props.title === "string" ? node.props.title : null; }
function previewAddress(href: string | undefined, page: string, fallback: string): string { return href ? page : fallback; }

/** Each changed text field and any reordering, as now and after, for the send panel. */
export function draftChanges(edits: Record<string, { props: string; children: string[] }>, nodes: Record<string, CatalogNode> | undefined): AgencyDraftChange[] {
  if (!nodes) return [];
  const rows: AgencyDraftChange[] = [];
  for (const [id, value] of Object.entries(edits)) {
    const original = nodes[id]; const parsed = object(value.props);
    if (!original) continue;
    const name = sectionTitle(original) ?? typeLabel(original.type);
    if (parsed) for (const [key, after] of Object.entries(parsed)) {
      const before = (original.props as Record<string, unknown>)[key];
      if (typeof after === "string" && after !== before) rows.push({ id: `${id}:${key}`, label: `${name} · ${fieldLabel(key).toLowerCase()}`, before: typeof before === "string" ? before : "", after });
    }
    if (JSON.stringify(value.children) !== JSON.stringify(original.children)) rows.push({ id: `${id}:order`, label: `${name} · order`, before: original.children.map(child => sectionTitle(nodes[child]) ?? typeLabel(nodes[child]?.type ?? "Section")).join(", "), after: value.children.map(child => sectionTitle(nodes[child]) ?? typeLabel(nodes[child]?.type ?? "Section")).join(", ") });
  }
  return rows;
}
