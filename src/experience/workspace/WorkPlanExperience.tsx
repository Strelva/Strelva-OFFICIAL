"use client";

import { useWorkspaceIntent } from "./WorkspaceIntent";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { TextArea, TextInput } from "@/components/ui/TextInput";
import type { BudgetExecution } from "@/platform/work-economics/runtime";
import type { JobEconomicsRecord } from "@/platform/work-economics/types";
import type { WorkPlan, WorkPlanOutputExecution } from "@/products/work-plans/contracts";
import type { WorkspaceWork } from "./contracts";
import { WorkPlanOutputPreview } from "./WorkPlanOutputPreview";

type PlanningEconomicsInput = { jobId: string; executionKey: string; maximumCents: number };
type PlanningEconomicsReceipt = BudgetExecution;
type PlanningBudgetResponse = {
  ledger: JobEconomicsRecord | null;
  executions: BudgetExecution[];
  currentActorId: string;
  canManage: boolean;
  canAccept: boolean;
};
type PlanningBudgetCommand = Record<string, unknown>;
type PlanResponse = { work: { id: string; workspaceId: string }; plan: WorkPlan; executions?: WorkPlanOutputExecution[]; planningEconomics?: PlanningEconomicsReceipt };
type StoredPlanningExecution = { executionKey: string; fingerprint?: string };

const PLANNING_PRODUCT_ID = "work_plans";
const PLANNING_RESOURCE_KIND = "plan";

function responseError(value: unknown, fallback: string): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const message = (value as { error?: unknown }).error;
  return typeof message === "string" && message.trim() ? message : fallback;
}

function money(cents: number | null): string {
  return cents === null
    ? "Not recorded"
    : new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(cents / 100);
}

function parseCents(value: FormDataEntryValue | null): number | null {
  if (value === null || value === "") return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > 10_000) throw new Error("Use an amount between $0 and $10,000.");
  return Math.round(amount * 100);
}

function executionIsHeld(execution: BudgetExecution | undefined): boolean {
  return Boolean(execution && (execution.status !== "finished" || execution.amountCents === null || execution.effect === "unknown"));
}

function executionStorageKey(workspaceId: string, jobId: string): string {
  return `strelva:planning-execution:${workspaceId}:${jobId}`;
}

function planningFingerprint(userGoal: string, sourceIds: readonly string[]): string {
  return JSON.stringify({ userGoal, sourceIds: [...sourceIds].sort() });
}

function readStoredExecution(workspaceId: string, jobId: string): StoredPlanningExecution | null {
  if (typeof window === "undefined") return null;
  try {
    const value: unknown = JSON.parse(window.sessionStorage.getItem(executionStorageKey(workspaceId, jobId)) ?? "null");
    if (!value || typeof value !== "object" || Array.isArray(value) || typeof (value as { executionKey?: unknown }).executionKey !== "string") return null;
    const fingerprint = (value as { fingerprint?: unknown }).fingerprint;
    return { executionKey: (value as { executionKey: string }).executionKey, ...(typeof fingerprint === "string" ? { fingerprint } : {}) };
  } catch {
    return null;
  }
}

function storeExecution(workspaceId: string, jobId: string, value: StoredPlanningExecution | null): void {
  if (typeof window === "undefined") return;
  try {
    const storageKey = executionStorageKey(workspaceId, jobId);
    if (value) window.sessionStorage.setItem(storageKey, JSON.stringify(value));
    else window.sessionStorage.removeItem(storageKey);
  } catch {
    // A storage restriction does not change the server-side idempotency boundary.
  }
}
export type WorkPlanExperienceProps = {
  presentation?: "document";
  workspaceId: string;
  workId?: string;
  initialRequest?: string;
  /** Supplied only after a payer has accepted the planning budget. */
  planningEconomics?: PlanningEconomicsInput;
  sources: readonly WorkspaceWork[];
  readOnly?: boolean;
  localPreview?: boolean;
  onSaved?: (workId: string) => void;
  onOpenWork?: (workId: string, productId?: string) => void;
};

export function WorkPlanExperience(props: WorkPlanExperienceProps) {
  const intent = useWorkspaceIntent();
  if (!props.workId && !props.initialRequest && !intent.ready) return <p role="status">Opening your request…</p>;
  return <PlanSession key={`${props.workspaceId}:${props.workId ?? "new"}`} {...props} initialRequest={props.initialRequest || (!props.workId && intent.route === "plan" ? intent.request : undefined)} />;
}

function PlanSession({ presentation, workspaceId, workId, initialRequest = "", planningEconomics: providedPlanningEconomics, sources, readOnly, localPreview, onSaved, onOpenWork }: WorkPlanExperienceProps) {
  const [request, setRequest] = useState(initialRequest);
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [result, setResult] = useState<PlanResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refining, setRefining] = useState(false);
  const [budget, setBudget] = useState<PlanningBudgetResponse | null>(null);
  const [budgetLoading, setBudgetLoading] = useState(!localPreview);
  const [budgetError, setBudgetError] = useState("");
  const [budgetBusy, setBudgetBusy] = useState(false);
  const [budgetRetry, setBudgetRetry] = useState<PlanningBudgetCommand | null>(null);
  const [executionJobId, setExecutionJobId] = useState(providedPlanningEconomics?.jobId ?? null);
  const [executionKey, setExecutionKey] = useState(providedPlanningEconomics?.executionKey ?? null);
  const [executionFingerprint, setExecutionFingerprint] = useState<string | null>(null);
  const providedJobId = providedPlanningEconomics?.jobId;
  const providedExecutionKey = providedPlanningEconomics?.executionKey;
  const providedMaximumCents = providedPlanningEconomics?.maximumCents;
  const availableSources = sources.filter(source => source.productId === "documents" || source.productId === "tracker" || Boolean(source.assessment));

  const applyBudget = useCallback((value: PlanningBudgetResponse) => {
    const ledger = value.ledger;
    if (ledger && (ledger.productId !== PLANNING_PRODUCT_ID || ledger.resourceKind !== PLANNING_RESOURCE_KIND)) {
      throw new Error("The planning budget target is unavailable.");
    }
    const normalized: PlanningBudgetResponse = { ...value, executions: value.executions ?? [] };
    setBudget(normalized);
    if (!ledger) {
      setExecutionJobId(providedJobId ?? null);
      setExecutionKey(providedExecutionKey ?? null);
      setExecutionFingerprint(null);
      return;
    }
    if (ledger.status === "settled" || ledger.status === "cancelled") {
      setExecutionJobId(null);
      setExecutionKey(null);
      setExecutionFingerprint(null);
      storeExecution(workspaceId, ledger.id, null);
      return;
    }
    const latest = normalized.executions[normalized.executions.length - 1];
    if (latest && latest.status === "finished" && latest.effect === "none" && latest.amountCents === 0) {
      setExecutionJobId(ledger.id);
      setExecutionKey(null);
      setExecutionFingerprint(null);
      storeExecution(workspaceId, ledger.id, null);
      return;
    }
    setExecutionJobId(ledger.id);
    if (latest) {
      setExecutionKey(latest.executionKey);
      setExecutionFingerprint(null);
    } else {
      const stored = providedJobId === ledger.id
        ? (providedExecutionKey ? { executionKey: providedExecutionKey } : null)
        : readStoredExecution(workspaceId, ledger.id);
      setExecutionKey(stored?.executionKey ?? null);
      setExecutionFingerprint(stored?.fingerprint ?? null);
    }
  }, [providedExecutionKey, providedJobId, workspaceId]);

  const loadPlanningBudget = useCallback(async () => {
    if (localPreview) return;
    setBudgetLoading(true);
    setBudgetError("");
    try {
      const query = new URLSearchParams({
        workspaceId,
        productId: PLANNING_PRODUCT_ID,
        resourceKind: PLANNING_RESOURCE_KIND,
      });
      const response = await fetch(`/api/work-economics?${query.toString()}`, { credentials: "same-origin", cache: "no-store" });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseError(body, "The planning budget could not be checked."));
      applyBudget(body as PlanningBudgetResponse);
    } catch (cause) {
      setBudgetError(cause instanceof Error ? cause.message : "The planning budget could not be checked.");
    } finally {
      setBudgetLoading(false);
    }
  }, [applyBudget, localPreview, workspaceId]);

  useEffect(() => { void loadPlanningBudget(); }, [loadPlanningBudget]);

  const command = useCallback(async (body: PlanningBudgetCommand) => {
    if (budgetBusy || readOnly || localPreview) return;
    setBudgetBusy(true);
    setBudgetError("");
    setBudgetRetry(null);
    let retryable = true;
    try {
      const response = await fetch("/api/work-economics", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
      const value: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        retryable = response.status >= 500;
        throw new Error(responseError(value, "The planning budget could not be updated."));
      }
      applyBudget(value as PlanningBudgetResponse);
    } catch (cause) {
      if (retryable) setBudgetRetry(body);
      setBudgetError(cause instanceof Error ? cause.message : "The planning budget could not be updated.");
    } finally {
      setBudgetBusy(false);
    }
  }, [applyBudget, budgetBusy, localPreview, readOnly]);

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
    if (result?.planningEconomics) {
      setError("This planning call already has a durable receipt. Reconcile its cost before preparing another plan.");
      return;
    }
    const job = budget?.ledger;
    const accepted = providedJobId
      ? { jobId: providedJobId, maximumCents: providedMaximumCents ?? 0 }
      : job && (job.status === "accepted" || job.status === "reserved")
        ? { jobId: job.id, maximumCents: job.maxAuthorizedCents }
        : null;
    if (!accepted) {
      setError("Accept a planning budget before preparing a model-backed plan.");
      return;
    }
    const latestExecution = budget?.executions[budget.executions.length - 1];
    if (latestExecution && !(latestExecution.status === "finished" && latestExecution.effect === "none" && latestExecution.amountCents === 0)) {
      setError("A previous planning call has a durable receipt. Its maximum remains held until the cost is reconciled.");
      return;
    }
    const fingerprint = planningFingerprint(request, sourceIds);
    if (executionJobId === accepted.jobId && executionKey && executionFingerprint && executionFingerprint !== fingerprint) {
      setError("The previous planning request was not confirmed. Retry it unchanged or reconcile its receipt before starting another request.");
      return;
    }
    const nextExecutionKey = executionJobId === accepted.jobId && executionKey
      ? executionKey
      : `planning:${crypto.randomUUID()}`;
    setExecutionJobId(accepted.jobId);
    setExecutionKey(nextExecutionKey);
    setExecutionFingerprint(fingerprint);
    storeExecution(workspaceId, accepted.jobId, { executionKey: nextExecutionKey, fingerprint });
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/work-plans", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          workspaceId,
          userGoal: request,
          sourceWorkIds: sourceIds,
          planningEconomics: {
            jobId: accepted.jobId,
            executionKey: nextExecutionKey,
            maximumCents: accepted.maximumCents,
          },
        }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const code = body && typeof body === "object" && !Array.isArray(body) ? (body as { code?: unknown }).code : undefined;
        if (code === "planning_receipt_requires_reconciliation") {
          await loadPlanningBudget();
          throw new Error("A previous planning call has a durable receipt. Its maximum remains held until the cost is reconciled.");
        }
        throw new Error(responseError(body, "The plan could not be prepared."));
      }
      const planResponse = body as PlanResponse;
      setResult(planResponse); setRefining(false); onSaved?.(planResponse.work.id);
      void loadPlanningBudget();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The plan could not be prepared.");
      void loadPlanningBudget();
    }
    finally { setBusy(false); }
  }

  const job = budget?.ledger;
  const latestExecution = budget?.executions[budget.executions.length - 1];
  const executionBlocksNewCall = Boolean(result?.planningEconomics || (latestExecution && !(latestExecution.status === "finished" && latestExecution.effect === "none" && latestExecution.amountCents === 0)));
  const accepted = Boolean(providedJobId || (job && (job.status === "accepted" || job.status === "reserved")));
  const canPrepare = !budgetLoading && !budgetError && accepted && !executionBlocksNewCall;
  const plan = result?.plan;
  const Heading = presentation === "document" ? "h2" : "h1";
  const budgetPanel = !localPreview ? <PlanningBudgetPanel workspaceId={workspaceId} budget={budget} loading={budgetLoading} error={budgetError} busy={budgetBusy} retry={budgetRetry} execution={latestExecution} canPropose={!workId || refining} readOnly={Boolean(readOnly)} onCommand={command} onRetry={() => void loadPlanningBudget()} /> : null;
  const composing = (!workId || refining) && !readOnly;
  return <section className="mx-auto w-full max-w-[720px] px-4 pb-24 pt-8 sm:px-6 sm:pt-12" aria-label="Work plan" aria-busy={busy}>
    <header>
      {plan ? <p className="mb-3 text-xs font-medium text-accent-text">Plan ready</p> : null}
      <Heading className="text-balance text-[32px] font-medium leading-10 tracking-[-0.025em] text-warm-black">{plan ? "Review the plan" : presentation === "document" ? "What should this document cover?" : "Plan this with Strelva"}</Heading>
      {!plan ? <p className="mt-3 text-base text-gray-muted">Strelva drafts what to build, the steps, and what it needs from you. Nothing is sent or published.</p> : null}
    </header>
    {localPreview ? <p role="status" className="mt-6 text-sm text-gray-muted">Preview only. Planning runs in a signed-in workspace.</p> : null}
    {error ? <p role="alert" className="mt-6 text-sm text-critical">{error}</p> : null}
    {result?.planningEconomics ? <p role="status" className="mt-6 text-sm text-gray-muted">Planning is recorded. Up to your limit stays held until the final cost is confirmed.</p> : null}
    {workId && !plan && !error && !localPreview ? <p role="status" className="mt-6 text-sm text-gray-muted">Loading your plan…</p> : null}
    {budgetPanel ? <div className="mt-8">{budgetPanel}</div> : null}
    {composing ? <form className="mt-6 space-y-6" onSubmit={event => { event.preventDefault(); void prepare(); }}>
      <TextArea label="The result you want" rows={4} value={request} maxLength={3000} required disabled={busy} onChange={event => setRequest(event.target.value)} placeholder="Help my team handle new customer requests without anything slipping through." />
      {availableSources.length ? <details className="text-sm"><summary className="cursor-pointer py-2 text-gray-muted">Use saved work{sourceIds.length ? ` (${sourceIds.length} selected)` : ""}</summary><fieldset className="space-y-1 pt-2"><legend className="sr-only">Saved work Strelva may read</legend><p className="mb-2 text-gray-muted">Pick up to six. Strelva reads a short excerpt of each.</p>{availableSources.map(source => <label key={source.id} className="flex min-h-10 items-center gap-3 text-warm-black"><input type="checkbox" checked={sourceIds.includes(source.id)} disabled={busy || (!sourceIds.includes(source.id) && sourceIds.length >= 6)} onChange={event => setSourceIds(current => event.target.checked ? [...current, source.id] : current.filter(id => id !== source.id))} />{source.title}</label>)}</fieldset></details> : null}
      {executionBlocksNewCall ? <p className="text-sm text-gray-muted" role="status">This plan was already run. Its cost is still being confirmed, so it can’t be run again yet.</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={busy || localPreview || !request.trim() || !canPrepare}>{busy ? "Preparing your plan…" : refining ? "Prepare a revised plan" : presentation === "document" ? "Prepare document draft" : "Prepare a plan"}</Button>
        {refining ? <Button type="button" variant="ghost" disabled={busy} onClick={() => setRefining(false)}>Keep this plan</Button> : null}
      </div>
    </form> : null}
    {plan ? <div className="mt-8">
      <p className="whitespace-pre-wrap border-l-2 border-gray-border pl-4 text-base text-gray-muted">{plan.userGoal}</p>
      <p className="mt-8 text-lg leading-7 text-warm-black">{plan.summary}</p>
      <ul className="mt-8 divide-y divide-gray-border border-y border-gray-border">{plan.proposedOutputs.map(output => <li key={`${result?.work.id}:${output.id}`} className="py-6"><h2 className="text-base font-medium text-warm-black">{output.title}</h2><p className="mt-1 text-sm text-gray-muted">{output.description}</p>{result ? <WorkPlanOutputPreview onOpenWork={onOpenWork} workspaceId={workspaceId} planWorkId={result.work.id} plan={plan} output={output} disabled={readOnly || localPreview} completed={result.executions?.find(execution => execution.outputId === output.id)} /> : null}</li>)}</ul>
      {plan.neededInputs.length || plan.requiredDecisions.length ? <section className="mt-12"><h2 className="text-base font-medium text-warm-black">Needs you</h2><ul className="mt-4 space-y-4">{plan.neededInputs.map(input => <li key={`input-${input.id}`}><p className="text-sm font-medium text-warm-black">{input.label}{input.required ? "" : " (optional)"}</p><p className="text-sm text-gray-muted">{input.reason}</p></li>)}{plan.requiredDecisions.map(decision => <li key={`decision-${decision.id}`}><p className="text-sm font-medium text-warm-black">{decision.question}</p><p className="text-sm text-gray-muted">{decision.reason}</p></li>)}</ul></section> : null}
      {plan.steps.length ? <details className="mt-12 text-sm"><summary className="cursor-pointer py-2 text-gray-muted">How this will be done</summary><ol className="mt-2 list-decimal space-y-3 pl-5">{plan.steps.map(step => <li key={step.id}><h3 className="font-medium text-warm-black">{step.title}</h3><p className="text-gray-muted">{step.description}</p></li>)}</ol></details> : null}
      {plan.context?.sources.length ? <details className="text-sm"><summary className="cursor-pointer py-2 text-gray-muted">What Strelva read</summary><ul className="mt-2 space-y-3">{plan.context.sources.map(source => <li key={source.workId}><a className="underline" href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}&work=${encodeURIComponent(source.workId)}`}>{source.title}</a><p className="text-gray-muted">{source.revision === null ? "Saved version" : `Revision ${source.revision}`} · Changed {new Date(source.updatedAt).toLocaleString()}</p></li>)}</ul></details> : null}
      <p className="mt-8 text-xs text-gray-muted">Each result above is created only when you choose it.</p>
      {!readOnly && !refining ? <Button className="mt-4" variant="secondary" onClick={() => setRefining(true)}>Add details and revise</Button> : null}
    </div> : null}
  </section>;
}

function PlanningBudgetPanel({
  workspaceId,
  budget,
  loading,
  error,
  busy,
  retry,
  execution,
  canPropose,
  readOnly,
  onCommand,
  onRetry,
}: {
  workspaceId: string;
  budget: PlanningBudgetResponse | null;
  loading: boolean;
  error: string;
  busy: boolean;
  retry: PlanningBudgetCommand | null;
  execution?: BudgetExecution;
  canPropose: boolean;
  readOnly: boolean;
  onCommand: (body: PlanningBudgetCommand) => Promise<void>;
  onRetry: () => void;
}) {
  const job = budget?.ledger;
  const terminal = job?.status === "settled" || job?.status === "cancelled";
  const canCreate = canPropose && !readOnly && Boolean(budget?.canManage);
  const canAccept = canPropose && !readOnly && Boolean(job?.status === "draft" && budget?.canAccept);
  const executionHeld = executionIsHeld(execution);
  const executionCompleted = Boolean(execution && execution.status === "finished" && execution.effect === "accepted");

  return <section className="space-y-4 rounded-2xl border border-gray-border p-4" aria-labelledby="planning-budget-heading">
    <div>
      <h2 id="planning-budget-heading" className="text-sm font-medium text-warm-black">Spending limit</h2>
      <p className="mt-1 text-sm text-gray-muted">Strelva won’t spend more than this on the plan.</p>
    </div>
    {loading ? <p role="status" className="text-sm">Checking your limit…</p> : null}
    {error ? <div className="space-y-2"><p role="alert" className="text-sm text-critical">{error}</p><Button type="button" variant="secondary" onClick={onRetry}>Try again</Button></div> : null}
    {retry && !readOnly ? <div className="space-y-2"><p className="text-sm">That change wasn’t confirmed. Retry sends it again unchanged.</p><Button type="button" variant="secondary" disabled={busy} onClick={() => void onCommand(retry)}>Retry budget change</Button></div> : null}
    {!loading && !error && !job && canCreate ? <PlanningBudgetProposal workspaceId={workspaceId} payerId={budget?.currentActorId} busy={busy} onCommand={onCommand} /> : null}
    {!loading && !error && terminal && canCreate ? <PlanningBudgetProposal workspaceId={workspaceId} payerId={budget?.currentActorId} busy={busy} onCommand={onCommand} /> : null}
    {!loading && !error && !job && !canCreate ? <p className="text-sm" role="status">Ask the workspace payer to set a limit.</p> : null}
    {job ? <>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-gray-muted">Status</dt><dd className="capitalize">{job.status}</dd></div>
        <div><dt className="text-gray-muted">Maximum</dt><dd>{money(job.maxAuthorizedCents)}</dd></div>
        <div><dt className="text-gray-muted">Used or held</dt><dd>{money(job.reservedCents)}</dd></div>
        <div><dt className="text-gray-muted">Recorded cost</dt><dd>{job.actualKnown ? money(job.actualCents) : executionHeld ? "Awaiting cost verification" : "Not recorded"}</dd></div>
      </dl>
      {job.status === "draft" ? canAccept ? <div className="space-y-2"><Button type="button" disabled={busy} onClick={() => void onCommand({ action: "accept", jobId: job.id })}>Accept planning budget</Button><p className="text-sm text-gray-muted">Nothing runs until you accept.</p></div> : <p className="text-sm text-gray-muted">Waiting for the payer to accept.</p> : null}
      {job.status === "accepted" || job.status === "reserved" ? <p className="text-sm text-gray-muted">Limit accepted.</p> : null}
      {executionHeld ? <p className="text-sm text-gray-muted" role="status">Up to {money(execution?.maximumCents ?? job.maxAuthorizedCents)} is held until the cost is confirmed.</p> : null}
      {executionCompleted && !executionHeld ? <p className="text-sm text-gray-muted" role="status">This limit has been used. Set a new one to plan again.</p> : null}
      {terminal && !canCreate ? <p className="text-sm text-gray-muted" role="status">This limit is {job.status}. The payer needs to set a new one.</p> : null}
    </> : null}
  </section>;
}

function PlanningBudgetProposal({ workspaceId, payerId, busy, onCommand }: { workspaceId: string; payerId?: string; busy: boolean; onCommand: (body: PlanningBudgetCommand) => Promise<void> }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const maximumCents = parseCents(form.get("planningMaximum"));
      if (maximumCents === null) throw new Error("Enter the maximum planning budget before proposing it.");
      void onCommand({
        action: "create",
        productId: PLANNING_PRODUCT_ID,
        resourceKind: PLANNING_RESOURCE_KIND,
        workspaceId,
        ...(payerId ? { payerId } : {}),
        estimateCents: null,
        maxAuthorizedCents: maximumCents,
      });
    } catch (cause) {
      // The form-level validation message is kept in the browser constraint
      // surface; the server remains the authority for the command.
      const input = event.currentTarget.elements.namedItem("planningMaximum");
      if (input instanceof HTMLInputElement) {
        input.setCustomValidity(cause instanceof Error ? cause.message : "Enter a valid maximum.");
        input.reportValidity();
      }
    }
  }

  return <form className="space-y-3" onSubmit={submit}>
    <p className="text-sm text-gray-muted">You’ll be the payer. You accept it in the next step.</p>
    <TextInput label="Maximum planning budget, USD" name="planningMaximum" type="number" min={0} max={10000} step="0.01" required onChange={event => event.currentTarget.setCustomValidity("")} />
    <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Propose planning budget"}</Button>
  </form>;
}
