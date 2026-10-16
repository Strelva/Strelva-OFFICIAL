"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import type { ReactNode } from "react";
import { RunningChecksView } from "@/experience/workspace/today/OwnerRunning";
import type { ResponsibilityProofCard } from "@/platform/work-execution/responsibility-proof";

export interface ResponsibilityProofData {
  proof: { cards: ResponsibilityProofCard[]; verdict: string };
  state: { businessId: string; providerWorkspaceId: string | null; canSetCadence: boolean; cadence: "weekly" | "monthly";
    mandates: Array<{ serviceRequestId: string; providerWorkspaceId: string; investigations: Record<string,string>; everySeconds: number; nextAt: string; idempotencyKey: string }> };
}
const responsibilityProofDataSchema = z.object({
  proof: z.object({ verdict: z.string(), cards: z.array(z.object({
    responsibilityId: z.string(), title: z.string(), from: z.string(), to: z.string(),
    status: z.enum(["verified", "partial", "failed", "unverified"]), did: z.string(), verified: z.string(),
    receiptRefs: z.array(z.string()), openHref: z.string(), undoHref: z.string().nullable(),
  })) }),
  state: z.object({ businessId: z.string(), providerWorkspaceId: z.string().nullable(), canSetCadence: z.boolean(), cadence: z.enum(["weekly", "monthly"]),
    mandates: z.array(z.object({ serviceRequestId: z.string(), providerWorkspaceId: z.string(), investigations: z.record(z.string(), z.string()), everySeconds: z.number().int().positive(), nextAt: z.string(), idempotencyKey: z.string() })) }),
});
function readResponsibilityProof(value: unknown, workspaceId: string): ResponsibilityProofData {
  const result = responsibilityProofDataSchema.safeParse(value);
  if (!result.success || result.data.state.businessId !== workspaceId) throw new Error("What Strelva keeps true could not be checked. Reload to confirm this business.");
  return result.data;
}
export function ResponsibilityProof(props: { workspaceId: string; readOnly: boolean; initial?: ResponsibilityProofData; children?: ReactNode }) {
  return <ScopedResponsibilityProof key={props.workspaceId} {...props} initial={props.initial?.state.businessId === props.workspaceId ? props.initial : undefined} />;
}
function ScopedResponsibilityProof({ workspaceId, readOnly, initial, children }: { workspaceId: string; readOnly: boolean; initial?: ResponsibilityProofData; children?: ReactNode }) {
  const [data, setData] = useState<ResponsibilityProofData | null>(initial ?? null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const active = useRef(true), readSequence = useRef(0);
  const controllers = useRef(new Set<AbortController>());
  function controller() { const value = new AbortController(); controllers.current.add(value); return value; }
  useEffect(() => {
    active.current = true;
    const pending = controllers.current;
    return () => { active.current = false; for (const request of pending) request.abort(); pending.clear(); };
  }, []);
  async function load() {
    const sequence = ++readSequence.current, request = controller();
    setError(""); setBusy(true);
    const to = new Date(); const from = new Date(to.getTime() - 7 * 86_400_000);
    try {
      const response = await fetch(`/api/operations?view=responsibility_proof&workspaceId=${workspaceId}&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`, { signal: request.signal });
      const result = await response.json().catch(() => { throw new Error("What Strelva keeps true could not be checked."); });
      if (!response.ok) throw new Error(result.error ?? "What Strelva keeps true could not be checked.");
      if (active.current && sequence === readSequence.current) setData(readResponsibilityProof(result, workspaceId));
    } catch (cause) { if (active.current && sequence === readSequence.current && !request.signal.aborted) setError(cause instanceof Error ? cause.message : "What Strelva keeps true could not be checked."); }
    finally { controllers.current.delete(request); if (active.current && sequence === readSequence.current) setBusy(false); }
  }
  useEffect(() => {
    if (initial) return;
    const sequence = ++readSequence.current, request = controller(), pending = controllers.current;
    const to = new Date(), from = new Date(to.getTime() - 7 * 86_400_000);
    fetch(`/api/operations?view=responsibility_proof&workspaceId=${workspaceId}&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`, { signal: request.signal })
      .then(async response => { const result = await response.json().catch(() => { throw new Error("What Strelva keeps true could not be checked."); }); if (!response.ok) throw new Error(result.error ?? "What Strelva keeps true could not be checked."); return readResponsibilityProof(result, workspaceId); })
      .then(result => { if (active.current && sequence === readSequence.current) setData(readResponsibilityProof(result, workspaceId)); }).catch(cause => { if (active.current && sequence === readSequence.current && !request.signal.aborted) setError(cause instanceof Error ? cause.message : "What Strelva keeps true could not be checked."); });
    return () => { request.abort(); pending.delete(request); };
  }, [workspaceId, initial]);
  async function change(command: Record<string,unknown>) {
    if (initial || readOnly || busy || error) return;
    const request = controller();
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command), signal: request.signal });
      const result = await response.json().catch(() => { throw new Error("The change could not be confirmed. Reload before trying again."); });
      if (!response.ok) throw new Error(result.error ?? "This change could not be confirmed. Reload before trying again.");
      if (!active.current || request.signal.aborted) return;
      setNotice(command.action === "keep_me_found" ? "Keep me found is running within the exact accepted scope." : "Report cadence saved.");
      await load();
    } catch (cause) { if (active.current && !request.signal.aborted) setError(cause instanceof Error ? cause.message : "The change could not be confirmed. Reload before trying again."); }
    finally { controllers.current.delete(request); if (active.current) setBusy(false); }
  }
  return <RunningChecksView data={data} error={error} busy={busy} notice={notice} readOnly={readOnly} locked={Boolean(initial)}
    onReload={() => { if (!initial) void load(); }}
    onCadence={cadence => void change({ action: "responsibility_cadence", workspaceId, cadence })}
    onKeepMeFound={mandate => void change({ action: "keep_me_found", input: { businessId: workspaceId, ...mandate } })}>{children}</RunningChecksView>;
}
