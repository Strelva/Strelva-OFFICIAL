"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { SelectInput, TextArea } from "@/components/ui/TextInput";
import { useWorkspaceRequest } from "@/experience/workspace/WorkspaceRequest";

const uuid = z.string().uuid();
const offerSchema = z.object({ versionId: uuid, sourceRevision: z.number().int().positive(), summary: z.string(),
  status: z.enum(["up_to_date", "auto_applicable", "blocked"]),
  conflicts: z.array(z.object({ path: z.string(), local: z.unknown(), upstream: z.unknown() }).passthrough()), missingBindings: z.array(z.string()),
}).passthrough();
const viewSchema = z.object({ workspaceId: uuid, systemId: uuid, versionId: uuid, rowRevision: z.number().int().positive(),
  canManage: z.boolean(), offers: z.array(offerSchema) }).passthrough();
const receiptSchema = z.object({ receiptId: uuid, decisionId: uuid, workspaceId: uuid, versionId: uuid, rowRevision: z.number().int().positive() }).strict();
const resultSchema = z.object({ outcome: z.enum(["prepared", "declined"]), rowRevision: z.number().int().positive(), receipt: receiptSchema.nullable() }).strict();
type View = z.infer<typeof viewSchema>;
function errorMessage(value: unknown, fallback: string) { return value && typeof value === "object" && "error" in value && typeof value.error === "string" ? value.error : fallback; }
function valueLabel(value: unknown) { return value === undefined ? "Removed" : typeof value === "string" ? value : JSON.stringify(value); }

/** Source changes remain drafts. Each business opens its own Needs you release
 * decision; this control never grants release authority or sends a message. */
export function SystemVersionImprovements({ workspaceId, systemId, versionId, readOnly }: { workspaceId: string; systemId: string; versionId: string; readOnly: boolean }) {
  const request = useWorkspaceRequest();
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState("");
  const [choices, setChoices] = useState<Record<string, "keep_local" | "take_upstream">>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");
  const pending = useRef<{ action: "adopt" | "decline"; body: string } | null>(null);
  const inFlight = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    void request(`/api/workspace/versions?${new URLSearchParams({ workspaceId, systemId })}`, { credentials: "same-origin", signal: controller.signal }).then(async response => {
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(data, "Shared improvements could not be read."));
      const parsed = viewSchema.parse(data);
      if (parsed.workspaceId !== workspaceId || parsed.systemId !== systemId || parsed.versionId !== versionId || parsed.offers.some(offer => offer.versionId !== versionId)) throw new Error("Shared improvements returned for another System.");
      if (!controller.signal.aborted) { setView(parsed); setError(""); }
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Shared improvements could not be read."); });
    return () => controller.abort();
  }, [request, workspaceId, systemId, versionId, attempt]);
  const offer = view?.offers.at(-1);
  const locked = busy || Boolean(pending.current) || Boolean(success);
  async function decide(action: "adopt" | "decline") {
    if (!view || !offer || readOnly || !view.canManage || inFlight.current || success) return;
    const resolutions = offer.conflicts.map(conflict => ({ path: conflict.path, choice: choices[conflict.path] }));
    if (!pending.current && (action === "adopt" ? offer.missingBindings.length > 0 || resolutions.some(item => !item.choice) : !reason.trim())) return;
    pending.current ??= { action, body: JSON.stringify({ workspaceId, systemId, versionId, rowRevision: view.rowRevision, revision: offer.sourceRevision, action,
      ...(action === "adopt" ? { resolutions } : { reason: reason.trim() }) }) };
    inFlight.current = true; setBusy(true); setError("");
    try {
      const response = await request("/api/workspace/versions", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: pending.current.body });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(data, "The decision could not be confirmed. Retry the same choice."));
      const result = resultSchema.parse(data);
      if (result.outcome !== (pending.current.action === "adopt" ? "prepared" : "declined") || result.rowRevision !== view.rowRevision + 1
        || (result.receipt && (result.receipt.workspaceId !== workspaceId || result.receipt.versionId !== versionId || result.receipt.rowRevision !== result.rowRevision))) throw new Error("The decision receipt could not be confirmed. Retry the same choice.");
      setSuccess(result.outcome === "declined" ? "This improvement was declined. The current release stays in place."
        : result.receipt ? "The improvement is prepared. Its release decision is in Needs you; nothing went live." : "The draft already matches the current release. No release decision was needed.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The decision could not be confirmed."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <div className="space-y-4 text-sm">
    {!view && !error ? <p role="status">Reading shared improvements…</p> : null}
    {error ? <p role="alert" className="text-critical">{error}</p> : null}
    {!view && error ? <Button variant="secondary" size="sm" onClick={() => { setError(""); setAttempt(value => value + 1); }}>Retry</Button> : null}
    {view && !offer ? <p className="text-gray-muted">This Version includes the latest shared changes.</p> : null}
    {offer ? <><p><strong>Source revision {offer.sourceRevision}</strong> · {offer.summary}</p>
      {offer.missingBindings.length ? <p role="status">Connect {offer.missingBindings.join(", ")} in this business before preparing the improvement.</p> : null}
      {offer.conflicts.map(conflict => <div key={conflict.path} className="space-y-2 min-w-0"><p className="break-words">{conflict.path}</p><p className="break-words text-gray-muted">Here: {valueLabel(conflict.local)}</p><p className="break-words text-gray-muted">Source: {valueLabel(conflict.upstream)}</p>
        {!readOnly && view?.canManage ? <SelectInput label={`Choice for ${conflict.path}`} disabled={locked} value={choices[conflict.path] ?? ""} onChange={event => setChoices(previous => ({ ...previous, [conflict.path]: event.target.value as "keep_local" | "take_upstream" }))} options={[{ value: "", label: "Choose what to keep" }, { value: "keep_local", label: "Keep our value" }, { value: "take_upstream", label: "Take the source value" }]} /> : null}
      </div>)}
      {!readOnly && view?.canManage && !success ? pending.current ? <Button size="sm" disabled={busy} loading={busy} onClick={() => void decide(pending.current!.action)}>Retry the same choice</Button> : <>
        <Button size="sm" disabled={busy || Boolean(offer.missingBindings.length) || offer.conflicts.some(conflict => !choices[conflict.path])} onClick={() => void decide("adopt")}>Prepare for review</Button>
        <TextArea label="Reason to decline" rows={2} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /><Button variant="secondary" size="sm" disabled={busy || !reason.trim()} onClick={() => void decide("decline")}>Decline improvement</Button>
      </> : readOnly || !view?.canManage ? <p className="text-gray-muted">An owner or admin can prepare or decline this improvement.</p> : null}
    </> : null}
    {success ? <p role="status">{success}</p> : null}
  </div>;
}
