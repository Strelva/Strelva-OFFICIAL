"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/TextInput";
import type { WorkPlan, WorkPlanOutputExecution } from "@/products/work-plans/contracts";
import type { WorkspaceWork } from "./contracts";
import { WorkPlanOutputPreview } from "./WorkPlanOutputPreview";

type PlanResponse = { work: { id: string; workspaceId: string }; plan: WorkPlan; executions?: WorkPlanOutputExecution[] };
export type WorkPlanExperienceProps = {
  workspaceId: string;
  workId?: string;
  initialRequest?: string;
  sources: readonly WorkspaceWork[];
  readOnly?: boolean;
  localPreview?: boolean;
  onSaved?: (workId: string) => void;
  onOpenWork?: (workId: string) => void;
};

export function WorkPlanExperience(props: WorkPlanExperienceProps) {
  return <PlanSession key={`${props.workspaceId}:${props.workId ?? "new"}`} {...props} />;
}

function PlanSession({ workspaceId, workId, initialRequest = "", sources, readOnly, localPreview, onSaved }: WorkPlanExperienceProps) {
  const [request, setRequest] = useState(initialRequest);
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [result, setResult] = useState<PlanResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refining, setRefining] = useState(false);
  const availableSources = sources.filter(source => source.productId === "documents" || source.productId === "tracker" || Boolean(source.assessment));
  useEffect(() => {
    if (!workId || localPreview) return;
    const controller = new AbortController();
    fetch(`/api/work-plans?workspaceId=${encodeURIComponent(workspaceId)}&workId=${encodeURIComponent(workId)}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Your plan could not be loaded.");
        if (!controller.signal.aborted) { setResult(body); setRequest(body.plan.userGoal); }
      }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Your plan could not be loaded."); });
    return () => controller.abort();
  }, [workspaceId, workId, localPreview]);

  async function prepare() {
    if (busy || readOnly || localPreview || !request.trim()) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/work-plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, userGoal: request, sourceWorkIds: sourceIds }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "The plan could not be prepared.");
      setResult(body); setRefining(false); onSaved?.(body.work.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The plan could not be prepared."); }
    finally { setBusy(false); }
  }

  const plan = result?.plan;
  return <section className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8" aria-label="Work plan" aria-busy={busy}>
    <header><p className="text-sm text-gray-muted">Work plan</p><h1 className="font-display text-2xl">{plan ? "Here is what the work involves" : "What would you like to accomplish?"}</h1><p className="mt-2 text-sm text-gray-muted">Describe the result you want. Strelva prepares a proposal using the work you choose to share.</p></header>
    {localPreview ? <p role="status" className="text-sm">AI planning is available in a configured, signed-in workspace. This preview does not call a model or save a plan.</p> : null}
    {error ? <p role="alert" className="text-sm text-critical">{error}</p> : null}
    {workId && !plan && !error && !localPreview ? <p role="status">Loading your plan…</p> : null}
    {(!workId || refining) && !readOnly ? <form className="space-y-4" onSubmit={event => { event.preventDefault(); void prepare(); }}>
      <TextArea label="The result you want" rows={5} value={request} maxLength={3000} required disabled={busy} onChange={event => setRequest(event.target.value)} placeholder="Help my team handle new customer requests without anything slipping through." />
      {availableSources.length ? <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">Include saved work, optional</legend><p className="mb-3 text-sm text-gray-muted">Choose up to six documents, trackers, or assessments. Strelva reads a limited excerpt of each selected item when preparing this plan.</p>{availableSources.map(source => <label key={source.id} className="flex items-center gap-3 py-2 text-sm"><input type="checkbox" checked={sourceIds.includes(source.id)} disabled={busy || (!sourceIds.includes(source.id) && sourceIds.length >= 6)} onChange={event => setSourceIds(current => event.target.checked ? [...current, source.id] : current.filter(id => id !== source.id))} />{source.title}</label>)}</fieldset> : null}
      <p className="text-sm text-gray-muted">Preparing a plan uses the configured AI provider. It does not publish, send messages, or start the proposed work.</p>
      <Button type="submit" disabled={busy || localPreview || !request.trim()}>{busy ? "Preparing your plan…" : refining ? "Prepare a revised plan" : "Prepare a plan"}</Button>
      {refining ? <Button type="button" variant="secondary" disabled={busy} onClick={() => setRefining(false)}>Keep this plan</Button> : null}
    </form> : null}
    {plan ? <>
      <section className="space-y-2"><h2 className="font-display text-xl">What you asked</h2><p className="whitespace-pre-wrap text-sm">{plan.userGoal}</p></section>
      {plan.context?.sources.length ? <details className="text-sm"><summary className="cursor-pointer">What Strelva looked at</summary><ul className="mt-3 space-y-3">{plan.context.sources.map(source => <li key={source.workId}><a className="underline" href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}&work=${encodeURIComponent(source.workId)}`}>{source.title}</a><p className="text-gray-muted">{source.revision === null ? "Saved version" : `Revision ${source.revision}`} · Last changed {new Date(source.updatedAt).toLocaleString()}</p></li>)}</ul><p className="mt-3 text-gray-muted">These are the versions used to prepare this proposal. Later source edits do not update the saved plan.</p></details> : null}
      <section className="space-y-3 border-t border-gray-border pt-4"><h2 className="font-display text-xl">The proposed shape</h2><p className="text-sm">{plan.summary}</p><ul className="space-y-6">{plan.proposedOutputs.map(output => <li key={`${result?.work.id}:${output.id}`}><h3 className="font-medium">{output.title}</h3><p className="text-sm text-gray-muted">{output.description}</p>{result ? <WorkPlanOutputPreview workspaceId={workspaceId} planWorkId={result.work.id} plan={plan} output={output} disabled={readOnly || localPreview} completed={result.executions?.find(execution => execution.outputId === output.id)} /> : null}</li>)}</ul></section>
      {plan.steps.length ? <section className="space-y-3 border-t border-gray-border pt-4"><h2 className="font-display text-xl">The plan</h2><ol className="list-decimal space-y-3 pl-5">{plan.steps.map(step => <li key={step.id}><h3 className="font-medium">{step.title}</h3><p className="text-sm text-gray-muted">{step.description}</p></li>)}</ol></section> : null}
      {plan.neededInputs.length || plan.requiredDecisions.length ? <section className="space-y-3 border-t border-gray-border pt-4"><h2 className="font-display text-xl">Needs you</h2><ul className="space-y-3">{plan.neededInputs.map(input => <li key={`input-${input.id}`}><p className="font-medium">{input.label}{input.required ? "" : " (optional)"}</p><p className="text-sm text-gray-muted">{input.reason}</p></li>)}{plan.requiredDecisions.map(decision => <li key={`decision-${decision.id}`}><p className="font-medium">{decision.question}</p><p className="text-sm text-gray-muted">{decision.reason}</p></li>)}</ul></section> : null}
      <p className="text-sm text-gray-muted">Cost has not been estimated. Each output needs its own explicit action. Creating private work does not start an ongoing job.</p>
      {!readOnly && !refining ? <Button variant="secondary" onClick={() => setRefining(true)}>Add details and revise</Button> : null}
    </> : null}
  </section>;
}
