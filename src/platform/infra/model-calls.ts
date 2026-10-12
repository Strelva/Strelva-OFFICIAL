/**
 * The one model-call helper (Ask Strelva spec §5, Reborn §7).
 *
 * Every `generateText`, `streamText` and `generateObject` call in `src` goes
 * through this module; eslint.config.mjs rejects importing them from `ai`
 * anywhere else. It does four things for every caller:
 *
 *  1. Primary then fallback. By default only on transient errors, and for a
 *     stream only while nothing has reached the person yet.
 *  2. The configured model. Only `visibility_probe` may pin a model, because
 *     it measures what one model says on purpose.
 *  3. One log row per provider call, fallback attempts and failures included:
 *     purpose, workspace, System, tenant, actor kind, model label, tokens,
 *     latency, outcome and cost.
 *  4. Cost as an estimate from the dated price table, unknown (never zero)
 *     for an unpriced model or missing tokens, replaced by a trusted provider
 *     receipt when the caller has one.
 *
 * A failed log write never fails the call (see model-call-log.ts).
 */
import { generateObject, generateText, streamText } from "ai";
import { getFallbackModel, getPrimaryModel, isTransientModelError, type ModelConfig } from "@/platform/infra/ai-models";
import {
  postgresModelCallSink,
  recordMissingModelCallRows,
  type ModelCallActorKind,
  type ModelCallPurpose,
  type ModelCallRow,
  type ModelCallSink,
} from "./model-call-log";
import { assertBusinessAiBudget, ModelBudgetPausedError, ModelBudgetUnavailableError } from "./business-ai-budget";
import { estimateModelCost, UNKNOWN_COST, type ModelCost } from "./model-prices";

export type { ModelConfig } from "@/platform/infra/ai-models";
export type { ModelCallActorKind, ModelCallPurpose, ModelCallRow, ModelCallSink } from "./model-call-log";
export { MODEL_CALL_PURPOSES, createMemoryModelCallSink } from "./model-call-log";
export { ModelBudgetPausedError } from "./business-ai-budget";

/** Who and what a call serves. Unknown fields stay null. */
export interface ModelCallContext {
  purpose: ModelCallPurpose;
  workspaceId?: string | null;
  systemId?: string | null;
  tenantId?: string | null;
  actorKind?: ModelCallActorKind;
}

/** A trusted, exact amount for one provider call (e.g. from provider-evidence). */
export interface ModelCallReceipt {
  costUsd: string;
}

export interface ModelCallControls<R> {
  /**
   * The models to try, in order. Defaults to the configured primary then
   * fallback. A caller may narrow that list (for example to providers with
   * credentials), never replace it with a model of its own; use `pinnedModel`.
   */
  models?: readonly ModelConfig[];
  /** Only for `visibility_probe`. The one model this call must measure. */
  pinnedModel?: ModelConfig;
  /** Whether a failed attempt may move to the next model. Default: transient errors. */
  shouldFallback?: (error: unknown) => boolean;
  /** Runs around each attempt (budget admission, output validation). Throwing
   * here counts as that attempt failing. */
  wrapAttempt?: (model: ModelConfig, run: () => Promise<R>) => Promise<R>;
  /** Exact cost for a finished call, when a trusted receipt exists. */
  receipt?: (result: R, model: ModelConfig) => ModelCallReceipt | null;
  /** Test seam. */
  sink?: ModelCallSink;
  /** Test seam. */
  now?: () => number;
}

let defaultSink: ModelCallSink = postgresModelCallSink;
/** Test seam: route every helper call to a different sink. Returns the previous one. */
export function setModelCallSink(sink: ModelCallSink): ModelCallSink {
  const previous = defaultSink;
  defaultSink = sink;
  return previous;
}

export class ModelCallConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelCallConfigurationError";
  }
}

export class NoModelAvailableError extends Error {
  constructor() {
    super("No model is configured for this call.");
    this.name = "NoModelAvailableError";
  }
}

function modelsFor(context: ModelCallContext, controls: { models?: readonly ModelConfig[]; pinnedModel?: ModelConfig }): ModelConfig[] {
  if (controls.pinnedModel) {
    if (context.purpose !== "visibility_probe") {
      throw new ModelCallConfigurationError("Only a visibility probe may pin a model.");
    }
    return [controls.pinnedModel];
  }
  if (controls.models) return [...controls.models];
  const fallback = getFallbackModel();
  return fallback ? [getPrimaryModel(), fallback] : [getPrimaryModel()];
}

function errorKind(error: unknown): string {
  if (!(error instanceof Error)) return "unknown";
  const message = error.message.toLowerCase();
  if (error.name === "AbortError" || message.includes("abort")) return "aborted";
  if (message.includes("timeout") || message.includes("timed out")) return "timeout";
  if (message.includes("429") || message.includes("rate limit") || message.includes("quota")) return "rate_limited";
  if (/\b5\d\d\b/.test(message)) return "provider_5xx";
  return error.name && error.name !== "Error" ? error.name.slice(0, 60) : "error";
}

interface StepUsage {
  inputTokens?: number | null;
  outputTokens?: number | null;
}

function usageOf(value: unknown): StepUsage {
  if (!value || typeof value !== "object") return {};
  const usage = (value as { usage?: unknown }).usage;
  if (!usage || typeof usage !== "object") return {};
  const read = (key: "inputTokens" | "outputTokens") => {
    const v = (usage as Record<string, unknown>)[key];
    return typeof v === "number" ? v : null;
  };
  return { inputTokens: read("inputTokens"), outputTokens: read("outputTokens") };
}

/** Collects the rows of one attempt and writes them once it settles. */
class AttemptLog {
  private readonly rows: ModelCallRow[] = [];
  private lastAt: number;
  private unit: { calledAt: string; reservationId: string | null; recorded: boolean } | null = null;
  providerBoundary = false;
  budgetRefusal: ModelBudgetPausedError | ModelBudgetUnavailableError | null = null;
  constructor(
    private readonly context: ModelCallContext,
    private readonly model: ModelConfig,
    private readonly attempt: number,
    private readonly now: () => number,
  ) {
    this.lastAt = now();
  }

  startProviderUnit(reservationId: string | null) {
    this.lastAt = this.now();
    this.unit = { calledAt: new Date(this.lastAt).toISOString(), reservationId, recorded: false };
  }

  get stepCount(): number {
    return this.rows.length;
  }

  add(usage: StepUsage, outcome: "ok" | "error", options: { error?: unknown; cost?: ModelCost } = {}) {
    if (this.providerBoundary && (!this.unit || this.unit.recorded)) return;
    if (this.unit) this.unit.recorded = true;
    const at = this.now();
    const cost = options.cost ?? estimateModelCost(this.model.label, usage);
    this.rows.push({
      calledAt: this.unit?.calledAt ?? new Date(this.lastAt).toISOString(),
      budgetReservationId: this.unit?.reservationId ?? null,
      purpose: this.context.purpose,
      workspaceId: this.context.workspaceId ?? null,
      systemId: this.context.systemId ?? null,
      tenantId: this.context.tenantId ?? null,
      actorKind: this.context.actorKind ?? "unknown",
      modelLabel: this.model.label,
      attempt: this.attempt,
      step: this.rows.length + 1,
      inputTokens: usage.inputTokens ?? null,
      outputTokens: usage.outputTokens ?? null,
      latencyMs: Math.max(0, Math.round(at - this.lastAt)),
      outcome,
      errorKind: outcome === "error" ? errorKind(options.error) : null,
      costUsd: cost.costUsd,
      costSource: cost.source,
      priceTableVersion: cost.priceTableVersion,
    });
    this.lastAt = at;
  }

  /** Replace the estimate on every row of this attempt with one exact receipt. */
  applyReceipt(receipt: ModelCallReceipt | null) {
    if (!receipt || this.rows.length === 0) return;
    for (const [index, row] of this.rows.entries()) {
      row.costSource = "provider_receipt";
      row.priceTableVersion = null;
      // The receipt covers the whole call; attribute it to the first row.
      row.costUsd = index === 0 ? receipt.costUsd : "0.00000000";
    }
  }

  async flush(sink: ModelCallSink) {
    if (this.rows.length === 0) return;
    try {
      await sink.record(this.rows);
    } catch (error) {
      await recordMissingModelCallRows(this.rows.length, error instanceof Error ? error.message : "sink_error");
    }
  }
}

/** Provider usage shapes differ between the v2 and v3 adapters. */
function providerUsage(value: unknown): StepUsage {
  if (!value || typeof value !== "object") return {};
  const usage = (value as { usage?: Record<string, unknown> }).usage;
  if (!usage) return {};
  const tokens = (key: string) => {
    const v = usage[key];
    if (typeof v === "number") return v;
    if (v && typeof v === "object" && "total" in v && typeof v.total === "number") return v.total;
    return null;
  };
  return { inputTokens: tokens("inputTokens"), outputTokens: tokens("outputTokens") };
}

/** The initial qualified path is text only, with a hard output/reasoning ceiling. */
function boundedTextRequest(request: unknown): boolean {
  if (!request || typeof request !== "object") return false;
  const value = request as Record<string, unknown>;
  if (!Number.isSafeInteger(value.maxOutputTokens) || Number(value.maxOutputTokens) <= 0 || value.providerOptions) return false;
  if (Array.isArray(value.tools) && value.tools.length > 0) return false;
  if (!Array.isArray(value.prompt)) return false;
  return value.prompt.every(message => {
    if (!message || typeof message !== "object") return false;
    const content = (message as { content?: unknown }).content;
    return typeof content === "string" || (Array.isArray(content) && content.every(part => part && typeof part === "object" && part.type === "text" && typeof part.text === "string"));
  });
}

/** SDK hooks can substitute another model or perform hidden calls. Capped work pauses. */
async function assertSdkOptions(context: ModelCallContext, options: Record<string, unknown>) {
  if (options.prepareStep || options.experimental_repairToolCall || options.tools) await assertBusinessAiBudget(context);
}

/**
 * The SDK can perform multiple requests per attempt. Intercept the actual
 * provider methods, so each fallback/tool step reserves separately and a failed
 * or unreadable request retains its hold. SDK retries are disabled at every entry.
 */
function providerBoundary(context: ModelCallContext, config: ModelConfig, log: AttemptLog): ModelConfig {
  const adapter = config.model;
  if (typeof adapter !== "object" || !adapter || !("doGenerate" in adapter) || !("doStream" in adapter)) return config;
  log.providerBoundary = true;
  const admit = async (request: unknown, operation: "generate" | "stream") => {
    try {
      const reservation = await assertBusinessAiBudget({ ...context, maximumCostUsd: () => {
        if (!config.billingCeiling?.qualification.trim() || !boundedTextRequest(request)) return undefined;
        return config.billingCeiling.maximumCostUsd(request, operation) ?? undefined;
      } });
      log.startProviderUnit(reservation);
    } catch (error) {
      // SDK streams may expose this as an error part or wrap the original error.
      // Preserve the admission refusal so no consumer/fallback policy can hide it.
      if (error instanceof ModelBudgetPausedError || error instanceof ModelBudgetUnavailableError) log.budgetRefusal = error;
      throw error;
    }
  };
  return { ...config, model: new Proxy(adapter, {
    get(target, property, receiver) {
      if (property === "doGenerate") return async (request: unknown) => {
        await admit(request, "generate");
        try {
          const result = await (target.doGenerate as (request: unknown) => Promise<unknown>).call(target, request);
          log.add(providerUsage(result), "ok");
          return result;
        } catch (error) {
          log.add({}, "error", { error, cost: UNKNOWN_COST });
          throw error;
        }
      };
      if (property === "doStream") return async (request: unknown) => {
        await admit(request, "stream");
        let recorded = false;
        const fail = (error: unknown) => {
          if (!recorded) { recorded = true; log.add({}, "error", { error, cost: UNKNOWN_COST }); }
        };
        try {
          const result = await (target.doStream as (request: unknown) => Promise<{ stream: ReadableStream<unknown> }>).call(target, request);
          // Count a stream once. A missing finish/usage, cancellation, transport
          // failure or provider error keeps unknown cost and the original hold.
          const reader = result.stream.getReader();
          const stream = new ReadableStream<unknown>({
            async pull(controller) {
              try {
                const next = await reader.read();
                if (next.done) { fail(new Error("Stream ended without usage")); controller.close(); return; }
                const part = next.value as { type?: string; error?: unknown };
                if (part?.type === "finish") { recorded = true; log.add(providerUsage(part), "ok"); }
                else if (part?.type === "error") fail(part.error);
                controller.enqueue(next.value);
              } catch (error) { fail(error); controller.error(error); }
            },
            async cancel(reason) { fail(reason); await reader.cancel(reason); },
          });
          return { ...result, stream };
        } catch (error) { fail(error); throw error; }
      };
      return Reflect.get(target, property, receiver);
    },
  }) };
}

async function runAttempts<R>(
  context: ModelCallContext,
  controls: ModelCallControls<R> & { canFallback?: () => boolean },
  call: (model: ModelConfig, log: AttemptLog) => Promise<R>,
  /** Rows from a finished result when no per-step callback fired. */
  settle: (result: R, log: AttemptLog) => void,
): Promise<{ result: R; model: ModelConfig; attempt: number }> {
  const models = modelsFor(context, controls);
  if (models.length === 0) throw new NoModelAvailableError();
  const sink = controls.sink ?? defaultSink;
  const now = controls.now ?? (() => Date.now());
  for (let index = 0; index < models.length; index += 1) {
    const model = models[index]!;
    const log = new AttemptLog(context, model, index + 1, now);
    // `run` is exactly one provider call (or one multi-step tool run): it logs
    // its own success or failure. A wrapper that refuses before calling it
    // (budget admission) or rejects its output afterwards (validation) adds
    // no row, because no further provider call happened.
    const run = async () => {
      // A wrapper may refuse before this point without committing any usage.
      // Real model objects admit each doGenerate/doStream, including SDK tool
      // steps. A model identifier/unqualified adapter cannot bypass admission.
      const guardedModel = providerBoundary(context, model, log);
      if (!log.providerBoundary) {
        const reservation = await assertBusinessAiBudget(context);
        log.startProviderUnit(reservation);
      }
      let result: R;
      try {
        result = await call(guardedModel, log);
      } catch (error) {
        if (!(error instanceof ModelBudgetPausedError) && !(error instanceof ModelBudgetUnavailableError)) log.add({}, "error", { error, cost: UNKNOWN_COST });
        throw error;
      }
      if (!log.providerBoundary && log.stepCount === 0) settle(result, log);
      return result;
    };
    try {
      const result = controls.wrapAttempt ? await controls.wrapAttempt(model, run) : await run();
      // A receipt that cannot be read fails this attempt, like any other
      // post-call check; the provider call's own row is still written.
      if (controls.receipt) log.applyReceipt(controls.receipt(result, model));
      await log.flush(sink);
      return { result, model, attempt: index + 1 };
    } catch (error) {
      await log.flush(sink);
      if (log.budgetRefusal) throw log.budgetRefusal;
      if (error instanceof ModelBudgetPausedError || error instanceof ModelBudgetUnavailableError) throw error;
      const next = models[index + 1];
      if (!next) throw error;
      if (controls.canFallback && !controls.canFallback()) throw error;
      const shouldFallback = controls.shouldFallback ?? isTransientModelError;
      if (!shouldFallback(error)) throw error;
    }
  }
  throw new NoModelAvailableError();
}

type GenerateTextOptions = Omit<Parameters<typeof generateText>[0], "model">;
type GenerateTextResult = Awaited<ReturnType<typeof generateText>>;
/** Loosely typed: `generateObject` is overloaded by output mode; callers keep their own schema types. */
type GenerateObjectOptions = Record<string, unknown>;
/** Options, or a function that builds fresh options per attempt (e.g. a per-attempt timeout). */
type PerAttempt<O> = O | (() => O);
function optionsFor<O>(options: PerAttempt<O>): O {
  return typeof options === "function" ? (options as () => O)() : options;
}
type StreamTextOptions = Omit<Parameters<typeof streamText>[0], "model">;
type StreamTextResult = ReturnType<typeof streamText>;
/** The stream a `streamModelText` consumer reads. */
export type ModelTextStream = StreamTextResult;

export interface ModelCallOutcome<R> {
  result: R;
  /** Label of the model that answered (e.g. "google/gemini-2.5-flash"). */
  modelLabel: string;
  /** 1 = first model, 2 = fallback. */
  attempt: number;
}

function withStepLog<O extends { onStepFinish?: unknown }>(options: O, log: AttemptLog): O {
  if (log.providerBoundary) return options;
  const original = options.onStepFinish as ((event: unknown) => unknown) | undefined;
  return {
    ...options,
    onStepFinish: async (event: unknown) => {
      log.add(usageOf(event), "ok");
      if (original) await original(event);
    },
  };
}

/** `generateText` through the helper (text, tools, structured `output`). */
export async function generateModelText<R = GenerateTextResult>(
  context: ModelCallContext,
  options: PerAttempt<GenerateTextOptions>,
  controls: ModelCallControls<R> = {},
): Promise<ModelCallOutcome<R>> {
  const outcome = await runAttempts<R>(
    context,
    controls,
    async (model, log) => {
      const actualOptions = optionsFor(options);
      await assertSdkOptions(context, actualOptions);
      return (await generateText({ ...withStepLog(actualOptions, log), maxRetries: 0, model: model.model } as Parameters<typeof generateText>[0])) as unknown as R;
    },
    (result, log) => {
      const steps = (result as { steps?: unknown }).steps;
      if (Array.isArray(steps) && steps.length > 0) for (const step of steps) log.add(usageOf(step), "ok");
      else log.add(usageOf(result), "ok");
    },
  );
  return { result: outcome.result, modelLabel: outcome.model.label, attempt: outcome.attempt };
}

/** `generateObject` through the helper. */
export async function generateModelObject<R = Awaited<ReturnType<typeof generateObject>>>(
  context: ModelCallContext,
  options: PerAttempt<GenerateObjectOptions>,
  controls: ModelCallControls<R> = {},
): Promise<ModelCallOutcome<R>> {
  const outcome = await runAttempts<R>(
    context,
    controls,
    async (model) => {
      const actualOptions = optionsFor(options);
      await assertSdkOptions(context, actualOptions);
      return (await generateObject({ ...actualOptions, maxRetries: 0, model: model.model } as Parameters<typeof generateObject>[0])) as unknown as R;
    },
    (result, log) => log.add(usageOf(result), "ok"),
  );
  return { result: outcome.result, modelLabel: outcome.model.label, attempt: outcome.attempt };
}

/**
 * `streamText` through the helper. `consume` reads the stream (and must throw
 * on an `error` part). A failed attempt moves to the fallback only while
 * `emitted()` is false, so a half-streamed answer is never duplicated.
 */
export async function streamModelText(
  context: ModelCallContext,
  options: StreamTextOptions,
  consume: (result: StreamTextResult, model: ModelConfig) => Promise<void>,
  controls: Omit<ModelCallControls<void>, "wrapAttempt" | "receipt"> & { emitted: () => boolean },
): Promise<{ modelLabel: string; attempt: number }> {
  const outcome = await runAttempts<void>(
    context,
    { ...controls, canFallback: () => !controls.emitted() },
    async (model, log) => {
      await assertSdkOptions(context, options);
      const result = streamText({ ...withStepLog(options, log), maxRetries: 0, model: model.model } as Parameters<typeof streamText>[0]);
      await consume(result, model);
    },
    (_result, log) => log.add({}, "ok"),
  );
  return { modelLabel: outcome.model.label, attempt: outcome.attempt };
}
