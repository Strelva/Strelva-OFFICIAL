import { getSupabase } from "@/platform/infra/db/client";
import { getRedis } from "@/platform/infra/redis";
import { logger } from "@/platform/infra/logger";
import type { ModelCostSource } from "./model-prices";

/**
 * One row per provider call (Ask Strelva spec §5). Written through the
 * service-role `record_model_call` function in
 * supabase/migrations/20261007140000_model_call_log.sql.
 *
 * A failed write never fails the model call. It is counted as a missing cost
 * row (`reb:model-call-log:missing:{yyyy-mm-dd}`) and logged, so the operator
 * sees that cost is under-recorded rather than silently low.
 */

export const MODEL_CALL_PURPOSES = [
  "ask",
  "ask.background",
  "operator",
  "rebuild",
  "work_plan",
  "report",
  "review_reply",
  "suggestion",
  "weekly_brief",
  "visibility_probe",
] as const;
export type ModelCallPurpose = (typeof MODEL_CALL_PURPOSES)[number];

export const MODEL_CALL_ACTOR_KINDS = ["owner", "member", "operator", "strelva", "visitor", "unknown"] as const;
export type ModelCallActorKind = (typeof MODEL_CALL_ACTOR_KINDS)[number];

export interface ModelCallRow {
  calledAt: string;
  purpose: ModelCallPurpose;
  workspaceId: string | null;
  systemId: string | null;
  /** Tenant slug at call time; SQL resolves and stores its stable id. */
  tenantId: string | null;
  actorKind: ModelCallActorKind;
  modelLabel: string;
  /** 1 = first model tried, 2 = fallback. */
  attempt: number;
  /** Provider call number inside one attempt (multi-step tool runs). */
  step: number;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  outcome: "ok" | "error";
  errorKind: string | null;
  costUsd: string | null;
  costSource: ModelCostSource;
  priceTableVersion: string | null;
}

export interface ModelCallSink {
  record(rows: readonly ModelCallRow[]): Promise<void>;
}

export const MODEL_CALL_LOG_TIMEOUT_MS = 1_000;

export function modelCallMissingKey(at = new Date()): string {
  return `reb:model-call-log:missing:${at.toISOString().slice(0, 10)}`;
}

/** Count rows that could not be written. Best effort, never throws. */
export async function recordMissingModelCallRows(count: number, reason: string): Promise<void> {
  if (count <= 0) return;
  logger.warn("[model-calls] cost rows not recorded", { count, reason });
  try {
    const redis = getRedis();
    if (!redis) return;
    const key = modelCallMissingKey();
    await redis.incrby(key, count);
    await redis.expire(key, 60 * 60 * 24 * 90);
  } catch {
    // The log line above is the remaining evidence.
  }
}

function rowPayload(row: ModelCallRow) {
  return {
    calledAt: row.calledAt,
    purpose: row.purpose,
    workspaceId: row.workspaceId,
    systemId: row.systemId,
    tenantId: row.tenantId,
    actorKind: row.actorKind,
    modelLabel: row.modelLabel,
    attempt: row.attempt,
    step: row.step,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    latencyMs: row.latencyMs,
    outcome: row.outcome,
    errorKind: row.errorKind,
    costUsd: row.costUsd,
    costSource: row.costSource,
    priceTableVersion: row.priceTableVersion,
  };
}

/** The production sink. Without Supabase env it records nothing and counts nothing
 * (local runs and tests); with env, every failure is counted as missing. */
export const postgresModelCallSink: ModelCallSink = {
  async record(rows) {
    if (rows.length === 0) return;
    const client = getSupabase();
    if (!client) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const call = (client.rpc as unknown as (name: string, args: Record<string, unknown>) => PromiseLike<{ error: { message?: string } | null }>)(
        "record_model_calls",
        { p_calls: rows.map(rowPayload) },
      );
      const timeout = new Promise<"timeout">((resolve) => { timer = setTimeout(() => resolve("timeout"), MODEL_CALL_LOG_TIMEOUT_MS); });
      const outcome = await Promise.race([Promise.resolve(call), timeout]);
      if (outcome === "timeout") return recordMissingModelCallRows(rows.length, "timeout");
      if (outcome.error) return recordMissingModelCallRows(rows.length, outcome.error.message ?? "rpc_error");
    } catch (error) {
      await recordMissingModelCallRows(rows.length, error instanceof Error ? error.message : "error");
    } finally {
      if (timer) clearTimeout(timer);
    }
  },
};

/** In-memory sink for tests and local proof. */
export function createMemoryModelCallSink(): ModelCallSink & { rows: ModelCallRow[] } {
  const rows: ModelCallRow[] = [];
  return {
    rows,
    async record(next) {
      rows.push(...next.map((row) => ({ ...row })));
    },
  };
}
