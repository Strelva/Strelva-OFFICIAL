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
import type { LanguageModelV1 } from "ai";
import { logger } from "./logger";

const PRIMARY_MODEL_ID = "gemini-2.5-flash";

export interface ModelConfig {
  model: LanguageModelV1;
  label: string;
}

export function getPrimaryModel(): ModelConfig {
  return {
    model: google(PRIMARY_MODEL_ID),
    label: `google/${PRIMARY_MODEL_ID}`,
  };
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
        return { model: anthropic(modelId), label: `anthropic/${modelId}` };
      }
      case "openai": {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { openai } = require("@ai-sdk/openai");
        return { model: openai(modelId), label: `openai/${modelId}` };
      }
      default:
        logger.warn("[ai-models] Unknown fallback provider", { provider });
        return null;
    }
  } catch (err) {
    logger.warn("[ai-models] Failed to initialize fallback model", {
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
