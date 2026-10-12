import { getRedis } from "./redis";
import { logger } from "./logger";
import type { ModelCallRow } from "./model-call-log";

/** Cost measurement only. An optional threshold warns operators; it never charges or emails. */
export function askCostThreshold(raw = process.env.STRELVA_ASK_COST_ALERT_USD): number | null {
  const value = Number(raw);
  return raw?.trim() && Number.isFinite(value) && value > 0 ? value : null;
}

export async function recordAskCostAlert(rows: readonly ModelCallRow[]): Promise<void> {
  const threshold = askCostThreshold();
  if (threshold === null || process.env.STRELVA_ASK_RELEASE !== "1") return;
  try {
    const redis = getRedis();
    if (!redis) return;
    for (const row of rows) {
      if (row.purpose !== "ask" || !row.workspaceId) continue;
      const base = `reb:ask-cost:${row.workspaceId}:${row.calledAt.slice(0, 10)}`;
      if (row.costUsd === null) {
        await redis.incr(`${base}:unknown`); await redis.expire(`${base}:unknown`, 90 * 86400);
        logger.warn("[ask] cost unknown", { workspaceId: row.workspaceId, model: row.modelLabel, day: row.calledAt.slice(0, 10) });
        continue;
      }
      const amount = Math.ceil(Number(row.costUsd) * 1_000_000_000);
      if (!Number.isSafeInteger(amount) || amount < 0) continue;
      const total = await redis.incrby(base, amount);
      await redis.expire(base, 90 * 86400);
      if (total >= threshold * 1_000_000_000 && total - amount < threshold * 1_000_000_000) {
        logger.warn("[ask] daily business cost threshold reached", { workspaceId: row.workspaceId, day: row.calledAt.slice(0, 10),
          measuredUsd: total / 1_000_000_000, thresholdUsd: threshold, costSource: "estimate_or_receipt", excludesUnknownCosts: true });
      }
    }
  } catch { /* Measurement failure never fails a customer's turn. */ }
}
