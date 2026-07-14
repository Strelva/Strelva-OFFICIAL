/**
 * Durable, shareable AI Visibility scorecards.
 *
 * This is an acquisition artifact, not tenant state. Redis provides a bounded
 * public-result lifetime; the unguessable id is the read capability. Monitoring
 * interest is promoted into the existing pre-tenant Delivery Lead lifecycle so
 * it becomes operator-actionable instead of landing in an invisible side store.
 */
import { getRedis } from "@/lib/redis";
import type { AiVisibilityResult, ScoreInput } from "./score";

const RESULT_TTL_SECONDS = 180 * 24 * 60 * 60;

export interface StoredAiVisibilityResult {
  id: string;
  result: AiVisibilityResult;
  input: Pick<ScoreInput, "category" | "location">;
  source?: string;
  createdAt: string;
}

function resultKey(id: string): string {
  return `reb:ai-visibility-result:${id}`;
}

function newResultId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `scan_${crypto.randomUUID().replace(/-/g, "")}`;
  }
  return `scan_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
}

export async function saveAiVisibilityResult(
  result: AiVisibilityResult,
  input: Pick<ScoreInput, "category" | "location">,
  source?: string,
): Promise<StoredAiVisibilityResult | null> {
  const redis = getRedis();
  if (!redis) return null;
  const stored: StoredAiVisibilityResult = {
    id: newResultId(),
    result,
    input,
    source: source?.trim().slice(0, 120) || undefined,
    createdAt: new Date().toISOString(),
  };
  await redis.set(resultKey(stored.id), stored, { ex: RESULT_TTL_SECONDS });
  return stored;
}

export async function getAiVisibilityResult(id: string): Promise<StoredAiVisibilityResult | null> {
  if (!/^scan_[a-z0-9]+$/i.test(id)) return null;
  const redis = getRedis();
  if (!redis) return null;
  return (await redis.get<StoredAiVisibilityResult>(resultKey(id))) ?? null;
}

export async function recordAiVisibilityResultView(id: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const key = `reb:ai-visibility-views:${id}`;
  await redis.incr(key);
  await redis.expire(key, RESULT_TTL_SECONDS, "NX");
}
