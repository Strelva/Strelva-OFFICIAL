/**
 * AI model configuration with fallback support.
 *
 * Primary: Google Gemini 2.5 Flash (always available via @ai-sdk/google)
 * Fallback: Configured via AI_FALLBACK_PROVIDER + AI_FALLBACK_MODEL env vars.
 * Supported fallback providers: "anthropic", "openai"
 *
 * When fallback env vars are not set, the system operates in single-model mode
 * (no fallback on failure).
 */

import { google } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import { logger } from "@/platform/infra/logger";
import { listPriceCeilingEnabled } from "./ai-controls-release";
import { LIST_PRICE_CEILING_QUALIFICATION, listPriceCeiling } from "./model-price-ceiling";

const PRIMARY_MODEL_ID = "gemini-2.5-flash";

export interface ModelConfig {
  model: LanguageModel;
  label: string;
  /**
   * Only an adapter with an enforced billing ceiling may supply this. It must
   * reject unsupported modalities/options and bound every billable input,
   * output (including reasoning), tool and provider-internal request. A
   * "qualified" ceiling comes from a provider-enforced bound. Only a
   * "list_price" ceiling derives from our own list-price table; it exists only
   * with STRELVA_AI_LIST_PRICE_CEILING=1, and its hold releases once the call's
   * estimated cost is logged. No production adapter is "qualified".
   */
  billingCeiling?: {
    qualification: string;
    /** Default "qualified". */
    source?: "qualified" | "list_price";
    /** Whether a request carrying function tools can be bounded. Default false. */
    acceptsTools?: boolean;
    maximumCostUsd: (request: unknown, operation: "generate" | "stream") => string | null;
  };
}

/** Attach the list-price ceiling when its flag is on. Priced labels only; an unpriced label yields no ceiling. */
export function withListPriceCeiling(config: ModelConfig): ModelConfig {
  if (!listPriceCeilingEnabled()) return config;
  return {
    ...config,
    billingCeiling: { qualification: LIST_PRICE_CEILING_QUALIFICATION, source: "list_price", acceptsTools: true, maximumCostUsd: listPriceCeiling(config.label) },
  };
}

export function getPrimaryModel(): ModelConfig {
  return withListPriceCeiling({
    model: google(PRIMARY_MODEL_ID),
    label: `google/${PRIMARY_MODEL_ID}`,
  });
}

export function getFallbackModel(): ModelConfig | null {
  const provider = process.env.AI_FALLBACK_PROVIDER;
  const modelId = process.env.AI_FALLBACK_MODEL;

  if (!provider || !modelId) return null;

  try {
    switch (provider) {
      case "anthropic": {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { anthropic } = require("@ai-sdk/anthropic");
        return withListPriceCeiling({ model: anthropic(modelId), label: `anthropic/${modelId}` });
      }
      case "openai": {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { openai } = require("@ai-sdk/openai");
        return withListPriceCeiling({ model: openai(modelId), label: `openai/${modelId}` });
      }
      default:
        logger.warn("[ai-models] Unknown fallback provider", { provider });
        return null;
    }
  } catch (err) {
    logger.error("[ai-models] Failed to initialize fallback model", {
      provider,
      modelId,
      error: err instanceof Error ? err.message : "unknown",
    });
    return null;
  }
}

/**
 * Returns true if the error looks like a transient provider failure
 * (timeout, rate limit, 5xx) that warrants a fallback retry.
 */
export function isTransientModelError(err: unknown): boolean {
  if (!(err instanceof Error)) return true; // Unknown errors get a retry

  const msg = err.message.toLowerCase();
  const name = err.name.toLowerCase();

  // Rate limits
  if (msg.includes("429") || msg.includes("rate limit") || msg.includes("quota")) return true;
  // Server errors
  if (msg.includes("500") || msg.includes("502") || msg.includes("503") || msg.includes("504")) return true;
  // Timeouts
  if (msg.includes("timeout") || msg.includes("timed out") || name.includes("timeout")) return true;
  // Network errors
  if (msg.includes("econnrefused") || msg.includes("econnreset") || msg.includes("fetch failed")) return true;

  return false;
}

/**
 * One named Google model, for the only caller allowed to pin a model: a
 * visibility probe that measures what that model says
 * (src/platform/infra/model-calls.ts enforces the purpose).
 */
export function getGoogleModel(modelId: string): ModelConfig {
  return { model: google(modelId), label: `google/${modelId}` };
}
