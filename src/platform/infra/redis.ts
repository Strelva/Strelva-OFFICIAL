/**
 * Shared Upstash Redis client for Strelva.
 *
 * Used by: tenant config cache, rate limiting, chat session cache, rewards KV.
 * Returns null when UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN is unset.
 * Every consumer MUST handle null (fall back to in-memory or Sanity).
 */

import { Redis } from "@upstash/redis";

let _instance: Redis | null | undefined;

/** Get the shared Redis client. Returns null if not configured. */
export function getRedis(): Redis | null {
  if (_instance !== undefined) return _instance;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    _instance = null;
    return null;
  }

  try {
    _instance = new Redis({ url, token });
    return _instance;
  } catch {
    _instance = null;
    return null;
  }
}
