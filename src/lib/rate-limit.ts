/** Sliding-window rate limiter.
 *  Uses Redis INCR + EXPIRE when configured (works across serverless instances).
 *  Falls back to in-memory Map in development only — production requires Redis. */

import { getRedis } from "./redis";
import { isProductionEnv } from "./production-guard";

// --- In-memory fallback store ---

interface Entry {
  count: number;
  resetAt: number;
}

export interface RateLimitStatus {
  limit: number;
  used: number;
  remaining: number;
  resetAt: string;
}

const memStore = new Map<string, Entry>();

function memCheck(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = memStore.get(key);

  if (!entry || now > entry.resetAt) {
    memStore.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  entry.count++;
  return entry.count > max;
}

function memStatus(key: string, max: number, windowMs: number): RateLimitStatus {
  const now = Date.now();
  const entry = memStore.get(key);
  if (!entry || now > entry.resetAt) {
    return {
      limit: max,
      used: 0,
      remaining: max,
      resetAt: new Date(now + windowMs).toISOString(),
    };
  }

  const used = Math.max(0, entry.count);
  return {
    limit: max,
    used,
    remaining: Math.max(0, max - used),
    resetAt: new Date(entry.resetAt).toISOString(),
  };
}

// --- Redis-backed check ---

async function redisCheck(key: string, max: number, windowSeconds: number): Promise<boolean> {
  const redis = getRedis();
  if (!redis) {
    if (isProductionEnv()) {
      throw new Error("[PRODUCTION] Redis required for rate limiting but not configured");
    }
    return memCheck(key, max, windowSeconds * 1000);
  }

  const redisKey = `reb:ratelimit:${key}`;
  try {
    const count = await redis.incr(redisKey);
    // Assert the TTL with NX on EVERY increment — not just count===1. The old
    // count===1-only EXPIRE could orphan a key with no TTL (lives forever, so
    // the limiter stays tripped forever) if the count===1 request died between
    // INCR and EXPIRE, or two concurrent first hits raced. NX means once a TTL
    // is set it isn't extended, preserving the fixed window.
    await redis.expire(redisKey, windowSeconds, "NX");
    return count > max;
  } catch (err) {
    // Fail CLOSED in production: a rate-limit infra failure throws (the caller
    // either 500s = denied, or — only the analytics beacon — explicitly catches
    // to fail open). Never silently allow unlimited requests here.
    if (isProductionEnv()) {
      throw new Error(`[PRODUCTION] Redis rate limit failed: ${err}`);
    }
    return memCheck(key, max, windowSeconds * 1000);
  }
}

async function redisStatus(key: string, max: number, windowSeconds: number): Promise<RateLimitStatus> {
  const redis = getRedis();
  if (!redis) {
    if (isProductionEnv()) {
      throw new Error("[PRODUCTION] Redis required for rate limiting but not configured");
    }
    return memStatus(key, max, windowSeconds * 1000);
  }

  const redisKey = `reb:ratelimit:${key}`;
  try {
    const [rawCount, ttl] = await Promise.all([
      redis.get<number>(redisKey),
      redis.ttl(redisKey),
    ]);
    const used = typeof rawCount === "number" ? rawCount : Number(rawCount || 0);
    const ttlSeconds = typeof ttl === "number" && ttl > 0 ? ttl : windowSeconds;
    return {
      limit: max,
      used,
      remaining: Math.max(0, max - used),
      resetAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    };
  } catch (err) {
    if (isProductionEnv()) {
      throw new Error(`[PRODUCTION] Redis rate limit status failed: ${err}`);
    }
    return memStatus(key, max, windowSeconds * 1000);
  }
}

/** Async rate limit check — uses Redis when available, in-memory otherwise.
 *  Preferred over isRateLimited for API routes that can await. */
export async function isRateLimitedAsync(key: string, maxPerMinute: number): Promise<boolean> {
  return redisCheck(key, maxPerMinute, 60);
}

/** Read the current one-minute rate-limit status without consuming a request. */
export async function getRateLimitStatusAsync(
  key: string,
  maxPerMinute: number
): Promise<RateLimitStatus> {
  return redisStatus(key, maxPerMinute, 60);
}

/** Like isRateLimited but accepts a custom window (in ms) instead of the default 60s.
 *
 * @deprecated In-memory only — does not scale across serverless instances and
 *   resets on every cold start. Prefer `isRateLimitedWindowedAsync` for all
 *   production API routes. This export is retained only for test helpers and
 *   local-dev code paths where Redis is unavailable. Calling it in production
 *   will throw — use `isRateLimitedWindowedAsync` instead.
 */
export function isRateLimitedWindowed(
  key: string,
  max: number,
  windowMs: number
): boolean {
  if (isProductionEnv()) {
    throw new Error(
      "isRateLimitedWindowed is in-memory only and must not be called in production. " +
      "Use isRateLimitedWindowedAsync instead."
    );
  }
  return memCheck(key, max, windowMs);
}

/** Async windowed rate limit — uses Redis when available. */
export async function isRateLimitedWindowedAsync(
  key: string,
  max: number,
  windowMs: number
): Promise<boolean> {
  const windowSeconds = Math.ceil(windowMs / 1000);
  return redisCheck(key, max, windowSeconds);
}

/** Extract a rate-limit key from a Request (uses x-forwarded-for or falls back to generic). */
export function rateLimitKey(req: Request, prefix: string): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  return `${prefix}:${ip}`;
}
