// In-memory, best-effort IP rate limiter for the checkout route. Per-instance
// (fine for a single client site); swap for Upstash if you run many instances.

const store = new Map<string, { count: number; resetAt: number }>();

/**
 * Best-effort client IP for rate-limit keying. Prefers `x-real-ip`, which the
 * platform proxy (Vercel) sets to the true connecting IP and a client cannot
 * forge, over the client-prependable `x-forwarded-for` chain.
 */
export function clientIp(request: Request): string {
  return (
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now >= entry.resetAt) store.delete(key);
    }
  }, 60_000);
}

/** Fixed-window limiter: `limit` requests per `windowMs` per key. */
export function rateLimit(
  key: string,
  limit: number,
  windowMs = 60_000,
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || now >= entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }
  if (entry.count >= limit) return { allowed: false, remaining: 0 };
  entry.count += 1;
  return { allowed: true, remaining: limit - entry.count };
}
