/** Public reads share the existing distributed limiter; cache misses have a
 * separate business budget so varying ranges cannot turn visits into provider floods. */
import { createHash } from "node:crypto";
import { getRedis } from "@/platform/infra/redis";
import { isRateLimitedAsync, rateLimitKey } from "@/platform/infra/rate-limit";
import { PublicBookingError } from "./errors";
import { BUSY_CACHE_SECONDS } from "./calendar-busy";

export async function limitPublicBookingRead(request: Request, business: string) {
  if (await isRateLimitedAsync(rateLimitKey(request, "public-booking-read"), 30)
    || await isRateLimitedAsync(`public-booking-read:${business}`, 120)) {
    throw new PublicBookingError("unavailable", "Too many availability requests. Try again in a minute.", 429);
  }
}

type Cache = { get<T>(key: string): Promise<T | null>; set(key: string, value: unknown, options: { ex: number; nx?: boolean }): Promise<unknown> };
export async function cachedPublicCalendarRead<T>(scope: string[], read: () => Promise<T>, deps: {
  cache?: Cache | null; limited?: typeof isRateLimitedAsync;
} = {}): Promise<T> {
  const cache = deps.cache === undefined ? getRedis() : deps.cache;
  const limited = deps.limited ?? isRateLimitedAsync;
  const key = `reb:booking:public-busy:${createHash("sha256").update(JSON.stringify(scope)).digest("hex")}`;
  // A cache error must not silently become an expensive provider call.
  const hit = await cache?.get<T>(key);
  if (hit != null) return hit;
  if (await limited(`public-booking-provider:${scope[0]}`, 10)) throw new PublicBookingError("unavailable", "Calendar availability is busy. Try again in a minute.", 429);
  // One distributed fill per range per minute, including provider failures.
  // Leave the lock to expire; a failed call cannot trigger an immediate stampede.
  if (cache && !await cache.set(`${key}:fill`, "1", { nx: true, ex: BUSY_CACHE_SECONDS })) {
    throw new PublicBookingError("unavailable", "Calendar availability is refreshing. Try again shortly.");
  }
  const value = await read();
  await cache?.set(key, value, { ex: BUSY_CACHE_SECONDS });
  return value;
}
