"use client";

import { ArrowLeft, CheckCircle2, Download, Loader2, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SelectInput } from "@/components/ui/TextInput";
import type { WorkspaceExitOptions, WorkspaceExitResponse } from "@/platform/workspace-exit/contracts";

type Props = { workspaceId: string; request?: typeof fetch };

async function readBody<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(body?.error || fallback);
  if (!body) throw new Error(fallback);
  return body as T;
}

export function WorkspaceExit({ workspaceId, request = fetch }: Props) {
  const [options, setOptions] = useState<WorkspaceExitOptions | null>(null);
  const [futureWork, setFutureWork] = useState<"pause" | "cancel">("pause");
  const [providerParticipation, setProviderParticipation] = useState<"keep" | "revoke">("keep");
  const [resourceKind, setResourceKind] = useState<"stop" | "successor">("stop");
  const [successorUserId, setSuccessorUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const loadSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError("");
    try {
      const response = await request(`/api/workspace-exit?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" });
      const next = await readBody<WorkspaceExitOptions>(response, "Workspace exit is unavailable.");
      if (sequence !== loadSequence.current) return;
      setOptions(next);
      setSuccessorUserId((current) => current || next.successors[0]?.userId || current);
    } catch (cause) {
      if (sequence !== loadSequence.current) return;
      setError(cause instanceof Error ? cause.message : "Workspace exit is unavailable.");
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [request, workspaceId]);

  useEffect(() => {
    setOptions(null);
    setSuccessorUserId("");
    setBusy(false);
    void load();
    return () => { loadSequence.current += 1; };
  }, [load]);

  async function complete() {
    if (resourceKind === "successor" && !successorUserId) {
      setError("Choose the verified workspace member who will take responsibility.");
      return;
    }
    const sequence = loadSequence.current;
    setBusy(true);
    setError("");
    try {
      const response = await request("/api/workspace-exit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          futureWork,
          providerParticipation,
          maintainedResources: resourceKind === "stop" ? { kind: "stop" } : { kind: "successor", successorUserId },
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const result = await readBody<WorkspaceExitResponse>(response, "Workspace exit could not be confirmed.");
      if (sequence !== loadSequence.current) return;
      setOptions((current) => current ? { ...current, state: result.state } : current);
    } catch (cause) {
      if (sequence !== loadSequence.current) return;
      setError(cause instanceof Error ? cause.message : "Workspace exit could not be confirmed.");
    } finally {
      if (sequence === loadSequence.current) setBusy(false);
    }
  }

  if (loading) return <main className="min-h-dvh bg-canvas px-6 py-12 text-warm-black"><div className="mx-auto max-w-3xl"><p role="status" className="text-sm text-gray-muted">Loading workspace exit options…</p></div></main>;
  if (error && !options) return <main className="min-h-dvh bg-canvas px-6 py-12 text-warm-black"><div className="mx-auto max-w-3xl"><a className="inline-flex min-h-10 items-center gap-2 text-sm text-gray-muted underline-offset-4 hover:underline" href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}&view=access`}><ArrowLeft className="size-4" aria-hidden="true" />Back to People &amp; access</a><div role="alert" className="mt-8 rounded-xl border border-critical/30 bg-critical/10 px-4 py-3 text-sm text-critical">{error}</div><Button className="mt-5" variant="secondary" onClick={() => void load()}>Try again</Button></div></main>;

  const state = options?.state;
  if (state) return <main className="min-h-dvh bg-canvas px-6 py-12 text-warm-black sm:px-8 lg:px-12"><div className="mx-auto max-w-3xl"><a className="inline-flex min-h-10 items-center gap-2 text-sm text-gray-muted underline-offset-4 hover:underline" href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}&view=access`}><ArrowLeft className="size-4" aria-hidden="true" />Back to People &amp; access</a><header className="mt-10"><p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-muted">Workspace exit</p><h1 className="mt-3 font-display text-4xl font-medium leading-tight">{state.futureWork === "paused" ? "New work is paused." : "New work has been cancelled."}</h1><p className="mt-4 max-w-2xl text-base leading-7 text-gray-muted">Your choice is recorded. Workspace records and results that still need review remain available for export.</p></header><Card padding="lg" className="mt-8"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 size-5 text-positive" aria-hidden="true" /><div><h2 className="font-medium">Exit decision recorded</h2><p className="mt-1 text-sm leading-6 text-gray-muted">Provider work was {state.providerParticipation}. {state.maintainedResources.kind === "successor" ? `A successor was named for ${state.maintainedResources.successorEmail} to review the resources.` : "Resources maintained in this workspace were stopped."} This decision does not change billing or stop an outside provider service. If this workspace has an existing website subscription, <Link className="underline underline-offset-4" href="/dashboard/settings#plan">review it in website billing settings</Link>.</p></div></div><div className="mt-7 grid gap-3 sm:grid-cols-2" aria-label="Exit results"><Result label="Assignments revoked" value={state.summary.assignmentsRevoked} /><Result label="Scheduled checks paused" value={state.summary.investigationsPaused} /><Result label="Accepted obligations retained" value={state.summary.retainedAccepted} /><Result label="Unknown obligations retained" value={state.summary.retainedUnknown} /></div>{state.retainedObligations.length ? <section className="mt-8" aria-labelledby="retained-obligations-heading"><h3 id="retained-obligations-heading" className="font-medium">Still needs review</h3><ul className="mt-3 grid gap-2 text-sm text-gray-muted">{state.retainedObligations.map((item) => <li key={item.workId} className="rounded-lg border border-gray-border px-3 py-2"><span className="font-medium text-warm-black">{item.title}</span><span className="ml-2">{obligationStatusLabel(item.status)} · {obligationEffectLabel(item.effect)}</span></li>)}</ul></section> : <p className="mt-8 text-sm text-gray-muted">No accepted results or unresolved results were found in this exit choice.</p>}<div className="mt-8 flex flex-wrap gap-3"><a href={`/workspace/export?workspaceId=${encodeURIComponent(workspaceId)}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-border px-4 py-2 text-sm font-medium text-warm-black hover:bg-surface-raised"><Download className="size-4" aria-hidden="true" />Export retained records</a><a href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}&view=access`} className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent/85">Return to workspace</a></div></Card></div></main>;

  return <main className="min-h-dvh bg-canvas px-6 py-12 text-warm-black sm:px-8 lg:px-12"><div className="mx-auto max-w-3xl"><a className="inline-flex min-h-10 items-center gap-2 text-sm text-gray-muted underline-offset-4 hover:underline" href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}&view=access`}><ArrowLeft className="size-4" aria-hidden="true" />Back to People &amp; access</a><header className="mt-10"><p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-muted">Workspace exit</p><h1 className="mt-3 font-display text-4xl font-medium leading-tight">Prepare to leave this workspace</h1><p className="mt-4 max-w-2xl text-base leading-7 text-gray-muted">Choose what should stop here. Records stay available for export until you explicitly request deletion. This decision does not change billing or stop an outside provider service. If you have an existing website subscription, <Link className="underline underline-offset-4" href="/dashboard/settings#plan">review it in website billing settings</Link>.</p></header>{error ? <div role="alert" className="mt-6 flex items-start gap-3 rounded-xl border border-critical/30 bg-critical/10 px-4 py-3 text-sm text-critical"><ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{error}</div> : null}<div className="mt-8 grid gap-5"><Card padding="lg"><fieldset><legend className="font-medium">Future work</legend><p className="mt-1 text-sm leading-6 text-gray-muted">Work that has already started, was accepted, or has an unresolved result stays available to review. Only work that has not started can be changed here.</p><label className="mt-5 flex cursor-pointer gap-3"><input className="mt-1" type="radio" name="future-work" value="pause" checked={futureWork === "pause"} onChange={() => setFutureWork("pause")} /><span><span className="font-medium">Pause new work</span><span className="block text-sm text-gray-muted">Keep new work paused and retain its history.</span></span></label><label className="mt-4 flex cursor-pointer gap-3"><input className="mt-1" type="radio" name="future-work" value="cancel" checked={futureWork === "cancel"} onChange={() => setFutureWork("cancel")} /><span><span className="font-medium">Cancel new work</span><span className="block text-sm text-gray-muted">Close work that has not started and retain its history.</span></span></label></fieldset></Card><Card padding="lg"><fieldset><legend className="font-medium">Provider work</legend><p className="mt-1 text-sm leading-6 text-gray-muted">Choose whether future provider work from this workspace should be revoked. This record cannot prove that an outside provider stopped.</p><label className="mt-5 flex cursor-pointer gap-3"><input className="mt-1" type="radio" name="provider-participation" value="keep" checked={providerParticipation === "keep"} onChange={() => setProviderParticipation("keep")} /><span><span className="font-medium">Keep recorded provider work</span><span className="block text-sm text-gray-muted">Keep accepted provider records available for review.</span></span></label><label className="mt-4 flex cursor-pointer gap-3"><input className="mt-1" type="radio" name="provider-participation" value="revoke" checked={providerParticipation === "revoke"} onChange={() => setProviderParticipation("revoke")} /><span><span className="font-medium">Revoke future provider work</span><span className="block text-sm text-gray-muted">Stop new provider delivery from this workspace and retain its history.</span></span></label></fieldset></Card><Card padding="lg"><fieldset><legend className="font-medium">Resources we maintain</legend><p className="mt-1 text-sm leading-6 text-gray-muted">Stop resources we maintain, or name a verified member to review them later. Naming someone records responsibility; it does not transfer ownership or grant access.</p><label className="mt-5 flex cursor-pointer gap-3"><input className="mt-1" type="radio" name="resources" value="stop" checked={resourceKind === "stop"} onChange={() => setResourceKind("stop")} /><span><span className="font-medium">Stop maintained resources</span><span className="block text-sm text-gray-muted">Stop offerings, applications, and access maintained here while leaving their records available.</span></span></label><label className="mt-4 flex cursor-pointer gap-3"><input className="mt-1" type="radio" name="resources" value="successor" disabled={!options?.successors.length} checked={resourceKind === "successor"} onChange={() => setResourceKind("successor")} /><span><span className="font-medium">Name someone to review them</span><span className="block text-sm text-gray-muted">Keep the resources and record who should review them next.</span></span></label>{resourceKind === "successor" ? <SelectInput label="Verified workspace member" value={successorUserId} onChange={(event) => setSuccessorUserId(event.target.value)} disabled={!options?.successors.length} options={[{ value: "", label: "Choose a successor" }, ...(options?.successors.map((successor) => ({ value: successor.userId, label: successor.email })) ?? [])]} helperText="Naming a person records responsibility; it does not transfer access." /> : null}{!options?.successors.length ? <p className="mt-4 text-sm text-gray-muted">No other verified workspace member is available to name. You can stop the resources and preserve their records.</p> : null}</fieldset></Card></div><div className="mt-7 flex flex-wrap items-center gap-4"><Button size="lg" loading={busy} disabled={busy || (resourceKind === "successor" && !successorUserId)} onClick={() => void complete()} icon={busy ? <Loader2 className="size-4" aria-hidden="true" /> : undefined}>Save exit choice</Button><p className="max-w-md text-xs leading-5 text-gray-muted">This choice is permanent for this workspace. Export first if you need an offline copy.</p></div></div></main>;
}

function Result({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-gray-border bg-surface-inset px-4 py-3"><p className="text-xs text-gray-muted">{label}</p><p className="mt-1 text-xl font-medium">{value}</p></div>;
}

function obligationStatusLabel(status: "running" | "waiting" | "needs_attention" | "accepted" | "unknown") {
  return status === "needs_attention" ? "Needs review" : status[0]!.toUpperCase() + status.slice(1);
}

function obligationEffectLabel(effect: "none" | "accepted" | "unknown") {
  return effect === "none" ? "No external effect confirmed" : effect === "accepted" ? "Accepted effect recorded" : "Effect is unknown";
}
