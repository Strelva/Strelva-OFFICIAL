"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {versionPreparationResultReceiptSchema,nativeVersionConflictSchema} from "@/platform/system-versions/native-preparation-contracts";
import { Button } from "@/components/ui/Button";
import { TextInput, TextArea, SelectInput } from "@/components/ui/TextInput";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";
const uuid = z.string().uuid();
const viewSchema = z.object({ workspaceId: uuid, systemId: uuid, versionId: uuid, rowRevision: z.number().int().positive(), canManage: z.boolean(),
  workingDefinition: z.record(z.string(), z.json()), releases: z.array(z.object({ number: z.number().int().positive(), releasedAt: z.string() }).passthrough()),
  overrides: z.array(z.object({ path: z.string() }).passthrough()), bindings: z.array(z.object({ kind: z.string(), connectionId: z.string() }).passthrough()),
  nativeRuntime:z.object({kind:z.enum(["inquiry_pattern","website_section"]),status:z.enum(["draft","verified","unverified"]),reviewHref:z.string()}).passthrough().nullable().optional(),
  bindingChoices: z.array(z.object({ kind: z.string(), connectionId: z.string(), label: z.string() })) }).passthrough();
const receiptSchema=versionPreparationResultReceiptSchema;
const resultSchema = z.object({ outcome: z.enum(["saved", "prepared","conflicted"]), rowRevision: z.number().int().positive(), receipt: receiptSchema.nullable(),conflict:nativeVersionConflictSchema.optional() }).strict();
type View = z.infer<typeof viewSchema>;
function failure(body: unknown, fallback: string) { return body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : fallback; }

/** Version changes stay in its working draft. Releasing, including restoring
 * an old release, is an explicit preparation through that business's Needs you. */
function ScopedSystemVersionManagement({ workspaceId, systemId, versionId, readOnly }: { workspaceId: string; systemId: string; versionId: string; readOnly: boolean }) {
  const request = useWorkspaceRequest();
  const [nativeConflict,setNativeConflict]=useState<z.infer<typeof nativeVersionConflictSchema>|null>(null),[nativeChoices,setNativeChoices]=useState<Record<string,"local"|"source">>({});
  const [view, setView] = useState<View | null>(null), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [nativeReview,setNativeReview]=useState<string|null>(null);
  const [attempt, setAttempt] = useState(0), [busy, setBusy] = useState(false);
  const [path, setPath] = useState(""), [value, setValue] = useState('"Local value"'), [account, setAccount] = useState(""), [kind, setKind] = useState("booking_calendar"), [release, setRelease] = useState("");
  const inFlight = useRef(false), pending = useRef<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void request(`/api/workspace/versions/manage?${new URLSearchParams({ workspaceId, systemId })}`, { credentials: "same-origin", signal: controller.signal }).then(async response => {
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(failure(data, "This Version’s draft could not be read."));
      const parsed = viewSchema.parse(data);
      if (parsed.workspaceId !== workspaceId || parsed.systemId !== systemId || parsed.versionId !== versionId) throw new Error("The draft returned for another System.");
      if (!controller.signal.aborted) { setView(parsed); setError(""); }
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "The draft could not be read."); });
    return () => controller.abort();
  }, [request, workspaceId, systemId, versionId, attempt]);
  async function save(change: Record<string, unknown>) {
    if (!view || readOnly || !view.canManage || inFlight.current) return;
    pending.current ??= JSON.stringify({ workspaceId, systemId, versionId, rowRevision: view.rowRevision, ...change });
    inFlight.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const response = await request("/api/workspace/versions/manage", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: pending.current });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(failure(data, "The draft could not be confirmed. Reload it before changing anything else."));
      const result = resultSchema.parse(data);
      const preparing = change.action === "prepare_release";
      if ((result.outcome !== (preparing ? "prepared" : "saved") && !(preparing&&result.outcome==="conflicted")) || (result.rowRevision !== view.rowRevision + (preparing ? 0 : 1) && !(preparing&&result.receipt&&"kind" in result.receipt&&result.rowRevision===view.rowRevision+1))
        || (result.receipt && (!preparing || result.receipt.workspaceId !== workspaceId || result.receipt.versionId !== versionId || result.receipt.rowRevision !== result.rowRevision))) {
        throw new Error("The draft receipt could not be confirmed. Reload the draft before changing anything else.");
      }
      if(result.conflict&&(result.conflict.workspaceId!==workspaceId||result.conflict.versionId!==versionId||result.conflict.rowRevision!==result.rowRevision))throw new Error("Native conflicts returned for another Version.");
      setNativeConflict(result.conflict??null);setNativeChoices({});
      setNotice(result.outcome==="conflicted" ? "Choose what to keep in the native draft. Nothing was staged or published." : result.outcome === "prepared" ? result.receipt ? "kind" in result.receipt ? "The native draft is ready for this business’s review. Nothing went live." : "The release decision is in Needs you. Nothing went live." : "The draft already matches the current release. No release decision was needed." : "The Version’s draft is saved. Its current release stays in place.");
      setNativeReview(result.receipt && "kind" in result.receipt ? result.receipt.reviewHref : null);
      pending.current = null; setAttempt(previous => previous + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The draft could not be confirmed."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  const locked = busy || Boolean(pending.current);
  return <div className="space-y-4 text-sm">
    {!view && !error ? <p role="status">Reading the Version’s draft…</p> : null}
    {error ? <p role="alert" className="text-critical">{error}</p> : null}
    {error ? <Button size="sm" variant="secondary" disabled={busy} onClick={() => { pending.current = null; setAttempt(previous => previous + 1); }}>Reload the draft</Button> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {nativeConflict ? <div className="space-y-3"><p>Local work overlaps this source update.</p>{nativeConflict.conflicts.map(c=><div key={c.path}><p className="break-words">{c.path}: local {JSON.stringify(c.local)} · source {JSON.stringify(c.source)}</p><SelectInput label={`Keep which ${c.path}?`} value={nativeChoices[c.path]??""} options={[{value:"",label:"Choose what to keep"},{value:"local",label:"Keep local"},{value:"source",label:"Use source"}]} onChange={e=>setNativeChoices(current=>({...current,[c.path]:e.target.value as "local"|"source"}))}/></div>)}<Button size="sm" disabled={busy||nativeConflict.conflicts.some(c=>!nativeChoices[c.path])} onClick={()=>void save({action:"prepare_release",nativeResolutions:nativeConflict.conflicts.map(c=>({path:c.path,choice:nativeChoices[c.path]}))})}>Stage the chosen native draft</Button></div>:null}{nativeReview ? <a className="inline-flex min-h-11 items-center text-brand underline" href={nativeReview}>Review in this business’s Needs you</a> : null}
    {view ? <>{view.nativeRuntime ? <p role="status">Native {view.nativeRuntime.kind==="website_section"?"website":"inquiry"}: {view.nativeRuntime.status==="verified"?"accepted publication verified":view.nativeRuntime.status==="unverified"?"current publication needs verification":"draft awaiting native review"}.</p> : null}<details><summary className="cursor-pointer text-gray-muted">Working definition and local changes</summary><pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(view.workingDefinition, null, 2)}</pre><p className="mt-2 text-gray-muted">Local changes: {view.overrides.map(item => item.path === "*" ? "Restored release" : item.path).join(", ") || "None"}</p><p className="text-gray-muted">Accounts: {view.bindings.map(item => item.kind).join(", ") || "None"}</p></details>
      {readOnly || !view.canManage ? <p className="text-gray-muted">An owner or admin can change this Version’s draft.</p> : <>
        <details><summary className="cursor-pointer">Change a local value</summary><div className="mt-3 space-y-3"><TextInput label="Definition path" value={path} disabled={locked} onChange={event => setPath(event.target.value)} helperText="For example: title, or followUp.message" /><TextArea label="Local value as JSON" value={value} disabled={locked} rows={3} onChange={event => setValue(event.target.value)} /><div className="flex flex-wrap gap-3"><Button size="sm" disabled={locked || !path.trim()} onClick={() => { try { void save({ action: "override", path: path.trim(), value: JSON.parse(value) }); } catch { setError("Enter a valid JSON value."); } }}>Save local value</Button><Button size="sm" variant="secondary" disabled={locked || !path.trim()} onClick={() => void save({ action: "override", path: path.trim(), clear: true })}>Clear local change</Button></div></div></details>
        <details><summary className="cursor-pointer">Bind an account from this business</summary><div className="mt-3 space-y-3"><SelectInput label="Account" disabled={locked} value={account} onChange={event => setAccount(event.target.value)} options={[{ value: "", label: "Choose this business’s account" }, ...view.bindingChoices.map(item => ({ value: item.connectionId, label: item.label }))]} /><TextInput label="What the account is used for" value={kind} disabled={locked} onChange={event => setKind(event.target.value)} helperText="Use the account kind required by the source, for example booking_calendar." /><Button size="sm" disabled={locked || !account || !kind.trim()} onClick={() => void save({ action: "bind", kind: kind.trim(), connectionId: account })}>Bind account</Button></div></details>
        {view.releases.length ? <details><summary className="cursor-pointer">Restore from History</summary><div className="mt-3 space-y-3"><SelectInput label="Earlier release" value={release} disabled={locked} onChange={event => setRelease(event.target.value)} options={[{ value: "", label: "Choose a release" }, ...view.releases.map(item => ({ value: String(item.number), label: `Release ${item.number} · ${item.releasedAt.slice(0, 10)}` }))]} /><p className="text-gray-muted">Restoring replaces the working definition. History and the current live release stay in place until the release decision.</p><Button size="sm" variant="secondary" disabled={locked || !release} onClick={() => void save({ action: "restore", releaseNumber: Number(release) })}>Restore into draft</Button></div></details> : null}
        <Button size="sm" disabled={locked} loading={busy} onClick={() => void save({ action: "prepare_release" })}>Prepare this draft for release</Button>
      </>}
    </> : null}
  </div>;
}

export function SystemVersionManagement(props:Parameters<typeof ScopedSystemVersionManagement>[0]){return <ScopedSystemVersionManagement key={`${props.workspaceId}:${props.systemId}:${props.versionId}`} {...props}/>;}
