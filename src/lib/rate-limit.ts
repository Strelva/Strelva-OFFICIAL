/** Simple in-memory sliding-window rate limiter.
 *  Resets on cold start — fine for Vercel serverless at small scale. */

const windowMs = 60_000; // 1-minute window

interface Entry {
  count: number;
  resetAt: number;
}

const store = new Map<string, Entry>();

/** Returns true if the request should be blocked. */
export function isRateLimited(key: string, maxPerMinute: number): boolean {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  entry.count++;
  return entry.count > maxPerMinute;
}

/** Extract a rate-limit key from a Request (uses x-forwarded-for or falls back to generic). */
export function rateLimitKey(req: Request, prefix: string): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  return `${prefix}:${ip}`;
}
