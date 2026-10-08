"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {versionPreparationResultReceiptSchema,nativeVersionConflictSchema} from "@/platform/system-versions/native-preparation-contracts";
import { Button } from "@/components/ui/Button";
import { SelectInput, TextArea } from "@/components/ui/TextInput";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";
import { ownerDecisionSchema } from "@/platform/needs-you/contracts";
import { ApplicationDraftPreview } from "@/experience/applications/ApplicationDraftPreview";
import { applicationSpecSchema } from "@/products/applications/contracts";

const uuid = z.string().uuid();
const systemRef = z.object({ businessId: uuid, systemId: uuid });
const possibilitySchema = z.object({ id: z.string(), system: systemRef, title: z.string(), summary: z.string(), sourceRevision: z.number().int().positive(),
  status: z.enum(["exploring", "ready"]), preview: z.record(z.string(), z.unknown()),
  changes: z.array(z.object({ path: z.string(), before: z.unknown(), after: z.unknown() })),
  conflicts: z.array(z.object({ path: z.string(), local: z.unknown(), upstream: z.unknown() })), missingAccounts: z.array(z.string()),
  makeReal: z.object({ kind: z.literal("version_release"), versionId: uuid }),
});
const pendingReleaseSchema = z.object({ id: z.string(), system: systemRef, title: z.string(), status: z.literal("ready"), rowRevision: z.number().int().positive(),
  decisionRevision: z.string().regex(/^[a-f0-9]{64}$/), current: z.record(z.string(), z.unknown()).nullable(), preview: z.record(z.string(), z.unknown()), changedPaths: z.array(z.string()),
  makeReal: z.object({ kind: z.literal("version_release"), versionId: uuid }),
});
const viewSchema = z.object({ workspaceId: uuid, systemId: uuid, versionId: uuid, rowRevision: z.number().int().positive(),
  nativeRuntime:z.object({kind:z.enum(["inquiry_pattern","website_section"])}).passthrough().nullable().optional(),
  canManage: z.boolean(), canMakeReal: z.boolean(), possibilities: z.array(possibilitySchema), pendingRelease: pendingReleaseSchema.nullable() }).passthrough();
const receiptSchema=versionPreparationResultReceiptSchema;
const resultSchema = z.object({ outcome: z.enum(["prepared", "declined","conflicted"]), rowRevision: z.number().int().positive(), receipt: receiptSchema.nullable(),conflict:nativeVersionConflictSchema.optional() }).strict();
type View = z.infer<typeof viewSchema>;
function errorMessage(value: unknown, fallback: string) { return value && typeof value === "object" && "error" in value && typeof value.error === "string" ? value.error : fallback; }
function valueLabel(value: unknown) { return value === undefined ? "Removed" : typeof value === "string" ? value : JSON.stringify(value); }
function nativeValueLabel(value: unknown) {
  if (value === null || value === undefined) return "Removed";
  if (typeof value === "string") return value;
  if (typeof value === "object" && "title" in value && typeof value.title === "string") return value.title;
  if (typeof value === "object" && "name" in value && typeof value.name === "string") return value.name;
  return "Changed content";
}

/** Reuses the real app renderer with component-local records only. A source
 * definition never supplies a maintenance owner, records or network transport. */
function VersionAlternative({ definition, label }: { definition: Record<string, unknown> | null; label: string }) {
  const app = definition?.kind === "internal_app" ? applicationSpecSchema.safeParse({ title: definition.title, fields: definition.fields, components: definition.components, maintenanceOwner: "local-preview" }) : null;
  return <div aria-label={label} className="min-w-0">
    {app?.success ? <ApplicationDraftPreview spec={app.data} /> : <pre className="whitespace-pre-wrap break-words">{JSON.stringify(definition, null, 2)}</pre>}
  </div>;
}

/** These are Version candidates in the normal Possibilities panel. Make real
 * uses the same pinned Needs you item; it never publishes or creates a second
 * approval, activation, release path or message. */
function ScopedSystemVersionImprovements({ workspaceId, systemId, versionId, readOnly, canMakeReal = true, onCount }: {
  workspaceId: string; systemId: string; versionId: string; readOnly: boolean; canMakeReal?: boolean; onCount?: (count: number) => void;
}) {
  const request = useWorkspaceRequest();
  const [nativeConflict,setNativeConflict]=useState<z.infer<typeof nativeVersionConflictSchema>|null>(null),[nativeChoices,setNativeChoices]=useState<Record<string,"local"|"source">>({});
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState("");
  const [choices, setChoices] = useState<Record<string, "keep_local" | "take_upstream">>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");
  const [prepared, setPrepared] = useState<z.infer<typeof receiptSchema> | null>(null);
  const [released, setReleased] = useState(false);
  const pending = useRef<{ action: "adopt" | "decline" | "prepare_release"; body: string; expectedRevision: number } | null>(null);
  const approval = useRef<{ itemId: string; revision: string } | null>(null);
  const inFlight = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    void request(`/api/workspace/versions?${new URLSearchParams({ workspaceId, systemId })}`, { credentials: "same-origin", signal: controller.signal }).then(async response => {
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(data, "Version possibilities could not be read."));
      const checked = viewSchema.safeParse(data);
      if (!checked.success) throw new Error("Version possibilities could not be confirmed for this System.");
      const parsed = checked.data;
      const candidates = [...parsed.possibilities, ...(parsed.pendingRelease ? [parsed.pendingRelease] : [])];
      if (parsed.workspaceId !== workspaceId || parsed.systemId !== systemId || parsed.versionId !== versionId
        || candidates.some(item => item.system.businessId !== workspaceId || item.system.systemId !== systemId || item.makeReal.versionId !== versionId)
        || (parsed.pendingRelease && parsed.pendingRelease.rowRevision !== parsed.rowRevision)) throw new Error("Version possibilities returned for another System or draft.");
      if (!controller.signal.aborted) { setView(parsed); setError(""); }
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Version possibilities could not be read."); });
    return () => controller.abort();
  }, [request, workspaceId, systemId, versionId, attempt]);
  useEffect(() => { onCount?.(released || (success && !prepared) ? 0 : (prepared ? 1 : (view?.possibilities.length ?? 0) + (view?.pendingRelease ? 1 : 0))); }, [view, prepared, released, success, onCount]);
  const offer = view?.possibilities.at(-1);
  const allowed = !readOnly && Boolean(view?.canMakeReal) && canMakeReal;
  const locked = busy || Boolean(pending.current) || Boolean(success);

  async function prepare(action: "adopt" | "decline" | "prepare_release") {
    if (!view || readOnly || !view.canManage || inFlight.current || success) return;
    const resolutions = offer?.conflicts.map(conflict => ({ path: conflict.path, choice: choices[conflict.path] })) ?? [];
    if(nativeConflict&&action==="prepare_release"&&nativeConflict.conflicts.some(c=>!nativeChoices[c.path]))return;
    if (!pending.current && (action === "adopt" ? !offer || offer.missingAccounts.length > 0 || resolutions.some(item => !item.choice) : action === "decline" ? !reason.trim() : !view.pendingRelease)) return;
    pending.current ??= { action, expectedRevision: view.rowRevision + (action === "prepare_release" ? 0 : 1), body: JSON.stringify({ workspaceId, systemId, versionId, rowRevision: view.rowRevision, action,
      ...(action === "prepare_release" ? nativeConflict ? {nativeResolutions:nativeConflict.conflicts.map(c=>({path:c.path,choice:nativeChoices[c.path]}))} : {} : { revision: offer!.sourceRevision, ...(action === "adopt" ? { resolutions } : { reason: reason.trim() }) }) }) };
    inFlight.current = true; setBusy(true); setError("");
    try {
      const response = await request(pending.current.action === "prepare_release" ? "/api/workspace/versions/manage" : "/api/workspace/versions", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: pending.current.body });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(data, "Preparation could not be confirmed. Retry the same choice."));
      const checked = resultSchema.safeParse(data);
      if (!checked.success) throw new Error("The decision receipt could not be confirmed. Retry the same choice.");
      const result = checked.data;
      if ((result.outcome !== (pending.current.action === "decline" ? "declined" : "prepared")&&!(pending.current.action!=="decline"&&result.outcome==="conflicted")) || (result.rowRevision !== pending.current.expectedRevision&&!(result.receipt&&"kind" in result.receipt&&result.rowRevision===pending.current.expectedRevision+1))
        || (result.receipt && (result.receipt.workspaceId !== workspaceId || result.receipt.versionId !== versionId || result.receipt.rowRevision !== result.rowRevision))) throw new Error("The decision receipt could not be confirmed. Retry the same choice.");
      if(result.conflict&&(result.conflict.workspaceId!==workspaceId||result.conflict.versionId!==versionId||result.conflict.rowRevision!==result.rowRevision))throw new Error("Native conflicts returned for another Version.");
      setNativeConflict(result.conflict??null);setNativeChoices({});
      if(result.conflict){pending.current=null;setSuccess("");setAttempt(v=>v+1);return;}
      setPrepared(result.receipt);
      setSuccess(result.outcome === "declined" ? "This improvement was declined. The current release stays in place."
        : result.receipt ? "Ready for review. Nothing went live." : "The draft already matches the current release. No release decision was needed.");
      if (result.receipt) setAttempt(value => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Preparation could not be confirmed."); }
    finally { inFlight.current = false; setBusy(false); }
  }

  async function makeReal() {
    if (!view || !allowed || inFlight.current || released || (!prepared && !view.pendingRelease) || (prepared && "kind" in prepared)) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      if (!approval.current) {
        const response = await request(`/api/workspace/needs-you?workspaceId=${encodeURIComponent(workspaceId)}`, { credentials: "same-origin", cache: "no-store" });
        const data: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error(errorMessage(data, "The release decision could not be read. Nothing was approved."));
        const checked = z.object({ role: z.enum(["owner", "admin", "member"]), items: z.array(ownerDecisionSchema) }).safeParse(data);
        if (!checked.success) throw new Error("The release decision could not be confirmed. Nothing was approved.");
        const needs = checked.data;
        if (needs.role !== "owner" || needs.items.some(item => item.workspaceId !== workspaceId)) throw new Error("Only this business's owner can make this Version real.");
        const item = needs.items.find(item => item.systemId === systemId && item.sourceLifecycle === "version_release" && item.sourceId === versionId && item.state === "open"
          && (prepared ? item.id === ("decisionId" in prepared ? prepared.decisionId : "") : item.revisionHash === view.pendingRelease!.decisionRevision));
        if (!item) throw new Error("This release decision is no longer open for this draft. Reload before making it real.");
        approval.current = { itemId: item.id, revision: item.revisionHash };
      }
      const response = await request("/api/workspace/needs-you", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, ...approval.current, decision: "approve" }) });
      const data: unknown = await response.json().catch(() => null);
      const parsed = z.object({ status: z.string(), item: ownerDecisionSchema.nullish(), error: z.string().optional() }).safeParse(data);
      const item = parsed.success ? parsed.data.item : null;
      if ((!response.ok && response.status !== 409) || !parsed.success || !["done", "already_handled"].includes(parsed.data.status) || !item || item.id !== approval.current.itemId || item.workspaceId !== workspaceId || item.systemId !== systemId
        || item.sourceLifecycle !== "version_release" || item.sourceId !== versionId || item.revisionHash !== approval.current.revision || item.state !== "approved" || item.outcome !== "done" || !item.receiptRef?.startsWith(`version_release:${versionId}:`)) {
        throw new Error(errorMessage(data, "The release outcome could not be confirmed. Check Needs you before trying another change."));
      }
      setReleased(true); setSuccess("The Version release went live. Its receipt is in Strelva handled.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The release outcome could not be confirmed. Check Needs you."); }
    finally { inFlight.current = false; setBusy(false); }
  }

  return <div className="space-y-4 text-sm" aria-label="Version possibilities">
    {!view && !error ? <p role="status">Reading Version possibilities…</p> : null}
    {error ? <p role="alert" className="text-critical">{error}</p> : null}
    {!view && error ? <Button size="lg" variant="secondary" onClick={() => { setError(""); setAttempt(value => value + 1); }}>Retry</Button> : null}
    {view && !offer && !view.pendingRelease && !success ? <p className="text-gray-muted">This Version has no alternatives waiting.</p> : null}
    {offer && !success && !prepared && !released ? <><p><strong>{offer.title}</strong> · {offer.status === "ready" ? "Ready" : "Exploring"}</p><p>{offer.summary}</p>
      <details><summary>Compare with the current draft</summary><ul className="my-3 space-y-2">{offer.changes.map(change => <li key={change.path} className="break-words">{change.path}: {valueLabel(change.before)} → {valueLabel(change.after)}</li>)}</ul><VersionAlternative definition={offer.preview} label="Alternative definition" /></details>
      {offer.missingAccounts.length ? <p role="status">Connect {offer.missingAccounts.join(", ")} in this business before preparing the improvement.</p> : null}
      {offer.conflicts.map(conflict => <div key={conflict.path} className="space-y-2 min-w-0"><p className="break-words">{conflict.path}</p><p className="break-words text-gray-muted">Here: {valueLabel(conflict.local)}</p><p className="break-words text-gray-muted">Source: {valueLabel(conflict.upstream)}</p>
        {!readOnly && view?.canManage ? <SelectInput label={`Choice for ${conflict.path}`} disabled={locked} value={choices[conflict.path] ?? ""} onChange={event => setChoices(previous => ({ ...previous, [conflict.path]: event.target.value as "keep_local" | "take_upstream" }))} options={[{ value: "", label: "Choose what to keep" }, { value: "keep_local", label: "Keep our value" }, { value: "take_upstream", label: "Take the source value" }]} /> : null}
      </div>)}
      {!readOnly && view?.canManage && !success ? pending.current ? <Button size="lg" disabled={busy} loading={busy} onClick={() => void prepare(pending.current!.action)}>Retry the same choice</Button> : <>
        <Button size="lg" disabled={busy || Boolean(offer.missingAccounts.length) || offer.conflicts.some(conflict => !choices[conflict.path])} onClick={() => void prepare("adopt")}>Prepare for review</Button>
        <TextArea label="Reason to decline" rows={2} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /><Button size="lg" variant="secondary" disabled={busy || !reason.trim()} onClick={() => void prepare("decline")}>Decline improvement</Button>
      </> : readOnly || !view?.canManage ? <p className="text-gray-muted">An owner or admin can prepare or decline this improvement.</p> : null}
    </> : null}
    {(prepared || view?.pendingRelease) && !released && (!success || prepared) ? <div className="space-y-3">
      <p><strong>{prepared ? "Prepared Version improvement" : view?.pendingRelease?.title}</strong> · Ready</p>
      {view?.pendingRelease && (!prepared || prepared.rowRevision === view.pendingRelease.rowRevision) ? <details><summary>Compare the release and alternative</summary><p className="my-3">Current release</p><VersionAlternative definition={view.pendingRelease.current} label="Current release preview" /><p className="my-3">Alternative</p><VersionAlternative definition={view.pendingRelease.preview} label="Prepared alternative preview" /></details> : prepared ? <p role="status">Reading the prepared alternative…</p> : null}
      <p>This changes only this business&apos;s System. Records and accounts stay here.</p>
      {!readOnly && view?.canManage && !prepared && !view.nativeRuntime ? <Button size="lg" variant="secondary" disabled={busy || Boolean(pending.current) || Boolean(success)} onClick={() => void prepare("prepare_release")}>Prepare this alternative for review</Button> : null}
      {prepared && "kind" in prepared ? <a className="inline-flex min-h-11 items-center text-brand underline" href={prepared.reviewHref}>Review in this business’s Needs you</a> : <Button size="lg" disabled={!allowed || busy} loading={busy} onClick={() => void (view?.nativeRuntime ? prepare("prepare_release") : makeReal())}>{view?.nativeRuntime ? "Prepare native draft for review" : approval.current ? "Retry Make real" : "Make real"}</Button>}
      {!allowed ? <p className="text-gray-muted">Only this business&apos;s owner can make it real. An admin can prepare it for review.</p> : null}
    </div> : null}
    {nativeConflict ? <div className="space-y-3"><p>Local work overlaps this source update. Choose what to keep; nothing went live.</p>{nativeConflict.conflicts.map(c=><div key={c.path}><p className="break-words">{nativeConflict.nativeKind === "website_section" ? "FAQ section" : "Inquiry pattern"}</p><p className="break-words">Local: {nativeValueLabel(c.local)} · Source: {nativeValueLabel(c.source)}</p><SelectInput label="Choose which content to keep" value={nativeChoices[c.path]??""} options={[{value:"",label:"Choose what to keep"},{value:"local",label:"Keep local"},{value:"source",label:"Use source"}]} onChange={e=>setNativeChoices(current=>({...current,[c.path]:e.target.value as "local"|"source"}))}/></div>)}<Button size="lg" disabled={busy||nativeConflict.conflicts.some(c=>!nativeChoices[c.path])} onClick={()=>void prepare("prepare_release")}>Stage the chosen native draft</Button></div>:null}
    {success ? <p role="status">{success}</p> : null}
  </div>;
}

export function SystemVersionImprovements(props:Parameters<typeof ScopedSystemVersionImprovements>[0]){return <ScopedSystemVersionImprovements key={`${props.workspaceId}:${props.systemId}:${props.versionId}`} {...props}/>;}
