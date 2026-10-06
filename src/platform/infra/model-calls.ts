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
import { getFallbackModel, getPrimaryModel, isTransientModelError, type ModelConfig } from "@/lib/ai-models";
import {
  postgresModelCallSink,
  recordMissingModelCallRows,
  type ModelCallActorKind,
  type ModelCallPurpose,
  type ModelCallRow,
  type ModelCallSink,
} from "./model-call-log";
import { estimateModelCost, UNKNOWN_COST, type ModelCost } from "./model-prices";

export type { ModelConfig } from "@/lib/ai-models";
export type { ModelCallActorKind, ModelCallPurpose, ModelCallRow, ModelCallSink } from "./model-call-log";
export { MODEL_CALL_PURPOSES, createMemoryModelCallSink } from "./model-call-log";

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
  constructor(
    private readonly context: ModelCallContext,
    private readonly model: ModelConfig,
    private readonly attempt: number,
    private readonly now: () => number,
  ) {
    this.lastAt = now();
  }

  get stepCount(): number {
    return this.rows.length;
  }

  add(usage: StepUsage, outcome: "ok" | "error", options: { error?: unknown; cost?: ModelCost } = {}) {
    const at = this.now();
    const cost = options.cost ?? estimateModelCost(this.model.label, usage);
    this.rows.push({
      calledAt: new Date().toISOString(),
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
      let result: R;
      try {
        result = await call(model, log);
      } catch (error) {
        log.add({}, "error", { error, cost: UNKNOWN_COST });
        throw error;
      }
      if (log.stepCount === 0) settle(result, log);
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
    async (model, log) => (await generateText({ ...withStepLog(optionsFor(options), log), model: model.model } as Parameters<typeof generateText>[0])) as unknown as R,
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
    async (model) => (await generateObject({ ...optionsFor(options), model: model.model } as Parameters<typeof generateObject>[0])) as unknown as R,
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
      const result = streamText({ ...withStepLog(options, log), model: model.model } as Parameters<typeof streamText>[0]);
      await consume(result, model);
    },
    (_result, log) => log.add({}, "ok"),
  );
  return { modelLabel: outcome.model.label, attempt: outcome.attempt };
}
