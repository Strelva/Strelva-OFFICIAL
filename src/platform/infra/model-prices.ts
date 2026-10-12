/**
 * Dated price table for model-call cost ESTIMATES (Ask Strelva spec §5).
 *
 * An estimate is tokens x list price. It is never a bill: a trusted receipt
 * from src/platform/work-economics/provider-evidence.ts replaces it where a
 * billing gateway gives the exact amount. A model missing from this table, or
 * a call whose provider reported no token counts, has an UNKNOWN cost. Unknown
 * is never written as zero.
 *
 * Changing a price: add a new table version with the date you checked the
 * provider's published list, and keep the old version string out of new rows.
 */

export const MODEL_PRICE_TABLE_VERSION = "2026-10-06";

export interface ModelPrice {
  /** US dollars per one million input tokens. */
  inputUsdPerMillion: number;
  /** US dollars per one million output tokens (thinking tokens included). */
  outputUsdPerMillion: number;
  /** Where the number came from and when it was last checked. */
  source: string;
}

/** Keyed by the model label `ModelConfig.label` carries ("provider/model"). */
export const MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
  "google/gemini-2.5-flash": {
    inputUsdPerMillion: 0.3,
    outputUsdPerMillion: 2.5,
    source: "Google Gemini API paid-tier list price for text input and output (thinking included), as published mid-2025; recorded 2026-10-06, not re-verified against a bill.",
  },
};

export type ModelCostSource = "estimate" | "provider_receipt" | "unknown";

export interface ModelCost {
  /** Decimal US dollars as a string (8 places), or null when unknown. */
  costUsd: string | null;
  source: ModelCostSource;
  priceTableVersion: string | null;
}

export const UNKNOWN_COST: ModelCost = Object.freeze({ costUsd: null, source: "unknown", priceTableVersion: null });

function validTokens(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && Number.isInteger(value);
}

/** Estimate one provider call's cost. Unknown model or missing tokens → unknown. */
export function estimateModelCost(
  modelLabel: string,
  usage: { inputTokens?: number | null; outputTokens?: number | null },
  table: Readonly<Record<string, ModelPrice>> = MODEL_PRICES,
  version: string = MODEL_PRICE_TABLE_VERSION,
): ModelCost {
  const price = Object.prototype.hasOwnProperty.call(table, modelLabel) ? table[modelLabel] : undefined;
  if (!price) return UNKNOWN_COST;
  if (!validTokens(usage.inputTokens) || !validTokens(usage.outputTokens)) return UNKNOWN_COST;
  const usd = (usage.inputTokens * price.inputUsdPerMillion + usage.outputTokens * price.outputUsdPerMillion) / 1_000_000;
  return { costUsd: usd.toFixed(8), source: "estimate", priceTableVersion: version };
}
