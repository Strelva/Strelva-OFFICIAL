"use client";
import { XaButton, XaDecision, XaField, XaFold, XaHeadline, XaObjectPage, XaStatus, XaTextArea } from "@/components/ui/strelva/Xa";

import { intentRequestFor, useWorkspaceIntent } from "./WorkspaceIntent";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { BudgetExecution } from "@/platform/work-economics/runtime";
import type { JobEconomicsRecord } from "@/platform/work-economics/types";
import type { WorkPlan, WorkPlanOutputExecution } from "@/products/work-plans/contracts";
import type { WorkspaceWork } from "./contracts";
import { useWorkspaceRequest } from "./WorkspaceRequest";
import { WorkPlanOutputPreview } from "./WorkPlanOutputPreview";

type PlanningEconomicsInput = { fundingWorkspaceId?: string; jobId: string; executionKey: string; maximumCents: number };
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
  /** Agency authoring supplies guarded adapters; default native paths stay unchanged. */
  prepareUrl?: string;
  outputUrl?: string;
  workspaceId: string;
  workId?: string;
  initialRequest?: string;
  systemsRelease?: boolean;
  onRequest?: (request: string) => void;
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
  const onSaved = props.onSaved && !props.workId ? (id: string) => { intent.spend("plan"); props.onSaved?.(id); } : props.onSaved;
  return <PlanSession key={`${props.workspaceId}:${props.workId ?? "new"}`} {...props} onSaved={onSaved} initialRequest={props.initialRequest || (!props.workId ? intentRequestFor(intent, "plan") : undefined)} />;
}

function PlanSession({ presentation, prepareUrl = "/api/work-plans", outputUrl, workspaceId, systemsRelease, onRequest, workId, initialRequest = "", planningEconomics: providedPlanningEconomics, sources, readOnly, localPreview, onSaved, onOpenWork }: WorkPlanExperienceProps) {
  const transport = useWorkspaceRequest();
  const [request, setRequest] = useState(initialRequest);
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [result, setResult] = useState<PlanResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refining, setRefining] = useState(false);
  const [budget, setBudget] = useState<PlanningBudgetResponse | null>(null);
  const [budgetLoading, setBudgetLoading] = useState(!localPreview);
  const [budgetError, setBudgetError] = useState("");
  const [fundingWorkspaceId, setFundingWorkspaceId] = useState(workspaceId);
  const [requestRequired, setRequestRequired] = useState(false);
  const [fallbackRequestId, setFallbackRequestId] = useState<string | null>(null);
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
      let funding = workspaceId;
      if (systemsRelease) {
        const authority = await fetch(`/api/work-plans/funding?workspaceId=${encodeURIComponent(workspaceId)}`, { credentials: "same-origin", cache: "no-store" });
        const body = await authority.json().catch(() => null) as { fundingWorkspaceId?: string; code?: string } | null;
        if (!authority.ok) {
          if (body?.code === "make_systems_required") setRequestRequired(true);
          throw new Error(responseError(body, "Planning authority could not be checked."));
        }
        if (!body?.fundingWorkspaceId) throw new Error("The planning budget target could not be confirmed.");
        funding = body.fundingWorkspaceId;
        setFundingWorkspaceId(funding);
      }
      const query = new URLSearchParams({
        workspaceId: funding,
        productId: PLANNING_PRODUCT_ID,
        resourceKind: PLANNING_RESOURCE_KIND,
      });
      const response = await transport(`/api/work-economics?${query.toString()}`, { credentials: "same-origin", cache: "no-store" });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseError(body, "The planning budget could not be checked."));
      applyBudget(body as PlanningBudgetResponse);
    } catch (cause) {
      setBudgetError(cause instanceof Error ? cause.message : "The planning budget could not be checked.");
    } finally {
      setBudgetLoading(false);
    }
  }, [applyBudget, localPreview, transport, workspaceId, systemsRelease]);

  useEffect(() => { void loadPlanningBudget(); }, [loadPlanningBudget]);

  const command = useCallback(async (body: PlanningBudgetCommand) => {
    if (budgetBusy || readOnly || localPreview) return;
    setBudgetBusy(true);
    setBudgetError("");
    setBudgetRetry(null);
    let retryable = true;
    try {
      const response = await transport("/api/work-economics", {
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
  }, [applyBudget, budgetBusy, localPreview, readOnly, transport]);

  useEffect(() => {
    if (!workId || localPreview) return;
    const controller = new AbortController();
    transport(`/api/work-plans?workspaceId=${encodeURIComponent(workspaceId)}&workId=${encodeURIComponent(workId)}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Your plan could not be loaded.");
        if (!controller.signal.aborted) { setResult(body); setRequest(body.plan.userGoal); }
      }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Your plan could not be loaded."); });
    return () => controller.abort();
  }, [workspaceId, workId, localPreview, transport]);

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
      setError("Agree what the plan may cost first.");
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
      const response = await transport(prepareUrl, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          workspaceId,
          userGoal: request,
          sourceWorkIds: sourceIds,
          planningEconomics: {
            jobId: accepted.jobId,
            ...(systemsRelease ? { fundingWorkspaceId } : {}),
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
        if (systemsRelease && code === "make_systems_required") setRequestRequired(true);
        if (code === "planning_request_filed") {
          const id = (body as { requestId?: unknown }).requestId;
          if (typeof id === "string") setFallbackRequestId(id);
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
  const canPrepare = !requestRequired && !budgetLoading && !budgetError && accepted && !executionBlocksNewCall;
  const plan = result?.plan;
  const Heading = presentation === "document" ? "h2" : "h1";
  // Asking for a plan: the ask on the left, the request itself as the object on the right.
  if (!plan && !workId && !readOnly && !requestRequired && presentation !== "document") return <section aria-label="Work plan" aria-busy={busy}><XaObjectPage phone="object-first"
    head={<><XaHeadline as={Heading} quiet={plan ? "Nothing starts until you choose a step." : "Say the result you want. Strelva writes a plan from the work you share."}>{plan ? "Strelva's plan." : presentation === "document" ? "What should this document cover?" : "What do you want done?"}</XaHeadline></>}
    story={<>
    {localPreview ? <p role="status" className="text-sm">Plans are written in a signed-in business. This one stays empty.</p> : null}
    {!localPreview && !requestRequired ? <PlanningBudgetPanel workspaceId={fundingWorkspaceId} budget={budget} loading={budgetLoading} error={budgetError} busy={budgetBusy} retry={budgetRetry} execution={latestExecution} canPropose={!workId || refining} readOnly={Boolean(readOnly)} onCommand={command} onRetry={() => void loadPlanningBudget()} /> : null}
    {error ? <p role="alert" className="text-sm text-critical">{error}</p> : null}
    {systemsRelease && fundingWorkspaceId !== workspaceId ? <p className="text-sm text-gray-muted">Your agency pays for this plan. The plan stays with this client.</p> : null}
    {fallbackRequestId ? <p role="status" className="text-sm">Your Request is in this business’s Requests for Strelva to review.</p> : null}
    {requestRequired ? <p role="status" className="text-sm">Your agency builds this. Say the result you want and it goes to them as a Request.</p> : null}
    {systemsRelease && onRequest && !fallbackRequestId && (requestRequired || error || budgetError) ? <XaButton type="button" variant="secondary" disabled={busy || !request.trim()} onClick={() => onRequest(request.trim())}>Send it as a Request</XaButton> : null}
    {result?.planningEconomics ? <p role="status" className="text-sm text-gray-muted">Strelva started the plan. Up to the most you agreed stays set aside until the real cost is in.</p> : null}
    {workId && !plan && !error && !localPreview ? <p role="status" className="text-sm text-[color:var(--st-text-2)]">Opening your plan</p> : null}
    {requestRequired && !readOnly ? <XaTextArea label="The result you want" rows={5} value={request} maxLength={3000} onChange={event => setRequest(event.target.value)} /> : null}
    </>}
    object={<XaDecision label="The result you want" status={<XaStatus kind="draft">Not written yet</XaStatus>} yes={null}>
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); void prepare(); }}>
      <XaTextArea label="The result you want" rows={5} value={request} maxLength={3000} required disabled={busy} onChange={event => setRequest(event.target.value)} placeholder="Help my team handle new customer requests without anything slipping through." />
      {availableSources.length ? <XaFold summary={<>Include saved work{sourceIds.length ? ` (${sourceIds.length} selected)` : " (optional)"}</>}><fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">Include saved work, optional</legend><p className="mb-3 text-sm text-gray-muted">Choose up to six. Strelva reads the start of each one.</p>{availableSources.map(source => <label key={source.id} className="flex items-center gap-3 py-2 text-sm"><input type="checkbox" checked={sourceIds.includes(source.id)} disabled={busy || (!sourceIds.includes(source.id) && sourceIds.length >= 6)} onChange={event => setSourceIds(current => event.target.checked ? [...current, source.id] : current.filter(id => id !== source.id))} />{source.title}</label>)}</fieldset></XaFold> : null}
      <p className="text-sm text-gray-muted">Writing the plan doesn’t publish, send or start anything.</p>
      {!budgetLoading && !budgetError && !accepted ? <p className="text-sm text-gray-muted" role="status">Agree the most it may cost above, then Strelva can write the plan.</p> : null}
      {executionBlocksNewCall ? <p className="text-sm text-gray-muted" role="status">The last plan is still being paid for. Strelva writes another once its cost is in.</p> : null}
      <XaButton variant="primary" size="lg" type="submit" busy={busy} disabled={localPreview || !request.trim() || !canPrepare}>{refining ? "Write it again" : presentation === "document" ? "Write a first draft" : "Write the plan"}</XaButton>
      {refining ? <XaButton type="button" variant="secondary" disabled={busy} onClick={() => setRefining(false)}>Keep this plan</XaButton> : null}
    </form>
    </XaDecision>} /></section>;
  return <section className="mx-auto flex max-w-[820px] flex-col gap-6 px-4 pb-32 pt-6 sm:px-12 sm:pt-16" aria-label="Work plan" aria-busy={busy}>
    <XaHeadline as={Heading} quiet={plan ? "Nothing starts until you choose a step." : "Say the result you want. Strelva writes a plan from the work you share."}>{plan ? "Strelva's plan." : presentation === "document" ? "What should this document cover?" : "What do you want done?"}</XaHeadline>
    {localPreview ? <p role="status" className="text-sm">Plans are written in a signed-in business. This one stays empty.</p> : null}
    {!localPreview && !requestRequired ? <PlanningBudgetPanel workspaceId={fundingWorkspaceId} budget={budget} loading={budgetLoading} error={budgetError} busy={budgetBusy} retry={budgetRetry} execution={latestExecution} canPropose={!workId || refining} readOnly={Boolean(readOnly)} onCommand={command} onRetry={() => void loadPlanningBudget()} /> : null}
    {error ? <p role="alert" className="text-sm text-critical">{error}</p> : null}
    {systemsRelease && fundingWorkspaceId !== workspaceId ? <p className="text-sm text-gray-muted">Your agency pays for this plan. The plan stays with this client.</p> : null}
    {fallbackRequestId ? <p role="status" className="text-sm">Your Request is in this business’s Requests for Strelva to review.</p> : null}
    {requestRequired ? <p role="status" className="text-sm">Your agency builds this. Say the result you want and it goes to them as a Request.</p> : null}
    {systemsRelease && onRequest && !fallbackRequestId && (requestRequired || error || budgetError) ? <XaButton type="button" variant="secondary" disabled={busy || !request.trim()} onClick={() => onRequest(request.trim())}>Send it as a Request</XaButton> : null}
    {result?.planningEconomics ? <p role="status" className="text-sm text-gray-muted">Strelva started the plan. Up to the most you agreed stays set aside until the real cost is in.</p> : null}
    {workId && !plan && !error && !localPreview ? <p role="status" className="text-sm text-[color:var(--st-text-2)]">Opening your plan</p> : null}
    {requestRequired && !readOnly ? <XaTextArea label="The result you want" rows={5} value={request} maxLength={3000} onChange={event => setRequest(event.target.value)} /> : null}
    {(!workId || refining) && !readOnly && !requestRequired && (plan || presentation === "document") ? <form className="space-y-4" onSubmit={event => { event.preventDefault(); void prepare(); }}>
      <XaTextArea label="The result you want" rows={5} value={request} maxLength={3000} required disabled={busy} onChange={event => setRequest(event.target.value)} placeholder="Help my team handle new customer requests without anything slipping through." />
      {availableSources.length ? <XaFold summary={<>Include saved work{sourceIds.length ? ` (${sourceIds.length} selected)` : " (optional)"}</>}><fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">Include saved work, optional</legend><p className="mb-3 text-sm text-gray-muted">Choose up to six. Strelva reads the start of each one.</p>{availableSources.map(source => <label key={source.id} className="flex items-center gap-3 py-2 text-sm"><input type="checkbox" checked={sourceIds.includes(source.id)} disabled={busy || (!sourceIds.includes(source.id) && sourceIds.length >= 6)} onChange={event => setSourceIds(current => event.target.checked ? [...current, source.id] : current.filter(id => id !== source.id))} />{source.title}</label>)}</fieldset></XaFold> : null}
      <p className="text-sm text-gray-muted">Writing the plan doesn’t publish, send or start anything.</p>
      {!budgetLoading && !budgetError && !accepted ? <p className="text-sm text-gray-muted" role="status">Agree the most it may cost above, then Strelva can write the plan.</p> : null}
      {executionBlocksNewCall ? <p className="text-sm text-gray-muted" role="status">The last plan is still being paid for. Strelva writes another once its cost is in.</p> : null}
      <XaButton variant="primary" size="lg" type="submit" busy={busy} disabled={localPreview || !request.trim() || !canPrepare}>{refining ? "Write it again" : presentation === "document" ? "Write a first draft" : "Write the plan"}</XaButton>
      {refining ? <XaButton type="button" variant="secondary" disabled={busy} onClick={() => setRefining(false)}>Keep this plan</XaButton> : null}
    </form> : null}
    {plan ? <>
      <XaFold summary={<>Original request</>}><p className="whitespace-pre-wrap">{plan.userGoal}</p></XaFold>
      {plan.context?.sources.length ? <XaFold summary={<>What Strelva looked at</>}><ul className="mt-3 space-y-3">{plan.context.sources.map(source => <li key={source.workId}><a className="underline" href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}&work=${encodeURIComponent(source.workId)}`}>{source.title}</a><p className="text-gray-muted">{source.revision === null ? "Saved state" : `Release ${source.revision}`} · Last changed {new Date(source.updatedAt).toLocaleString()}</p></li>)}</ul><p className="mt-3 text-gray-muted">The plan used these as they were then. Later changes to them don’t change the plan.</p></XaFold> : null}
      <section className="space-y-3 border-t border-gray-border pt-4"><h2 className="text-[13px] font-medium leading-[18px] text-[color:var(--st-text-3)]">Ready to review</h2><p className="text-sm">{plan.summary}</p><ul className="space-y-6">{plan.proposedOutputs.map(output => <li key={`${result?.work.id}:${output.id}`}><h3 className="font-medium">{output.title}</h3><p className="text-sm text-gray-muted">{output.description}</p>{result ? <WorkPlanOutputPreview executionUrl={outputUrl} onOpenWork={onOpenWork} workspaceId={workspaceId} planWorkId={result.work.id} plan={plan} output={output} disabled={readOnly || localPreview} completed={result.executions?.find(execution => execution.outputId === output.id)} /> : null}</li>)}</ul></section>
      {plan.steps.length ? <XaFold summary={<>How this will be done</>}><ol className="list-decimal space-y-3 pl-5">{plan.steps.map(step => <li key={step.id}><h3 className="font-medium">{step.title}</h3><p className="text-sm text-gray-muted">{step.description}</p></li>)}</ol></XaFold> : null}
      {plan.neededInputs.length || plan.requiredDecisions.length ? <section className="space-y-3 border-t border-gray-border pt-4"><h2 className="text-[13px] font-medium leading-[18px] text-[color:var(--st-text-3)]">Details needed for this plan</h2><p className="text-sm text-gray-muted">{readOnly ? "Ask someone with permission to revise this plan to add these details." : "Add these details with “Add details and revise” below."} Answering them approves nothing.</p><ul className="space-y-3">{plan.neededInputs.map(input => <li key={`input-${input.id}`}><p className="font-medium">{input.label}{input.required ? "" : " (optional)"}</p><p className="text-sm text-gray-muted">{input.reason}</p></li>)}{plan.requiredDecisions.map(decision => <li key={`decision-${decision.id}`}><p className="font-medium">{decision.question}</p><p className="text-sm text-gray-muted">{decision.reason}</p></li>)}</ul></section> : null}
      <p className="text-sm text-gray-muted">Each step starts only when you choose it.</p>
      {!readOnly && !refining ? <XaButton variant="secondary" onClick={() => setRefining(true)}>Add details and revise</XaButton> : null}
    </> : null}
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

  return <section className="space-y-4 border-t border-gray-border pt-4" aria-labelledby="planning-budget-heading">
    <div>
      <h2 id="planning-budget-heading" className="text-[13px] font-medium leading-[18px] text-[color:var(--st-text-3)]">What the plan may cost</h2>
      <p className="mt-1 text-sm text-gray-muted">Say the most it may cost before Strelva writes it. Nothing is charged here.</p>
    </div>
    {loading ? <p role="status" className="text-sm text-[color:var(--st-text-2)]">Checking what it may cost</p> : null}
    {error ? <div className="space-y-2"><p role="alert" className="text-sm text-critical">{error}</p><XaButton type="button" variant="secondary" onClick={onRetry}>Try again</XaButton></div> : null}
    {retry && !readOnly ? <div className="space-y-2"><p className="text-sm">The last change wasn’t confirmed. Trying again sends the same change.</p><XaButton type="button" variant="secondary" disabled={busy} onClick={() => void onCommand(retry)}>Try again</XaButton></div> : null}
    {!loading && !error && !job && canCreate ? <PlanningBudgetProposal workspaceId={workspaceId} payerId={budget?.currentActorId} busy={busy} onCommand={onCommand} /> : null}
    {!loading && !error && terminal && canCreate ? <PlanningBudgetProposal workspaceId={workspaceId} payerId={budget?.currentActorId} busy={busy} onCommand={onCommand} /> : null}
    {!loading && !error && !job && !canCreate ? <p className="text-sm" role="status">Whoever pays for this business sets what plans may cost. Ask them first.</p> : null}
    {job ? <>
      <p className="text-[15px] text-[color:var(--st-text)]">Up to {money(job.maxAuthorizedCents)}{job.reservedCents ? `, ${money(job.reservedCents)} set aside` : ""}{job.actualKnown ? `, ${money(job.actualCents)} spent` : executionHeld ? ", real cost not in yet" : ""}.</p>
      {job.status === "draft" ? canAccept ? <div className="space-y-2"><XaButton variant="secondary" type="button" disabled={busy} onClick={() => void onCommand({ action: "accept", jobId: job.id })}>Agree to {money(job.maxAuthorizedCents)}</XaButton><p className="text-sm text-gray-muted">Strelva writes nothing until you agree.</p></div> : <p className="text-sm text-gray-muted">Waiting on whoever pays for this business to agree.</p> : null}
      {job.status === "accepted" || job.status === "reserved" ? <p className="text-sm text-gray-muted">Agreed. Strelva sets it aside when it starts writing.</p> : null}
      {executionHeld ? <p className="text-sm text-gray-muted" role="status">Up to {money(execution?.maximumCents ?? job.maxAuthorizedCents)} stays set aside until the real cost is in.</p> : null}
      {executionCompleted && !executionHeld ? <p className="text-sm text-gray-muted" role="status">This plan is paid for. Another one needs a new amount agreed.</p> : null}
      {terminal && !canCreate ? <p className="text-sm text-gray-muted" role="status">This amount is {job.status}. Whoever pays sets a new one before the next plan.</p> : null}
    </> : null}
  </section>;
}

function PlanningBudgetProposal({ workspaceId, payerId, busy, onCommand }: { workspaceId: string; payerId?: string; busy: boolean; onCommand: (body: PlanningBudgetCommand) => Promise<void> }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const maximumCents = parseCents(form.get("planningMaximum"));
      if (maximumCents === null) throw new Error("Write the amount in dollars, like 2.50.");
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
    <p className="text-sm">You choose the maximum and become the payer. Proposing it does not accept it.</p>
    <XaField label="The most it may cost, in dollars" name="planningMaximum" type="number" min={0} max={10000} step="0.01" required onChange={event => event.currentTarget.setCustomValidity("")} />
    <XaButton variant="secondary" type="submit" disabled={busy}>{busy ? "Saving" : "Set this amount"}</XaButton>
  </form>;
}
