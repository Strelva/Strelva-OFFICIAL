import { getRedis } from "@/lib/redis";
import type { SiteHealthSnapshot } from "./site-coverage";

/**
 * Latest every-site health result. Derived evidence, re-derivable from the
 * monitors on every run, so it is a cache in Redis next to the domain monitor's
 * snapshot. A missing snapshot reads as "no evidence", never as healthy.
 */
const LATEST_KEY = "reb:site-health:latest";
const LATEST_TTL_SECONDS = 60 * 60 * 24 * 30;

export class SiteHealthStoreUnavailableError extends Error {
  constructor() { super("Site health storage is unavailable."); this.name = "SiteHealthStoreUnavailableError"; }
}

/** Saving is part of the cron's job, so a failed save is reported, not hidden. */
export async function saveSiteHealth(snapshot: SiteHealthSnapshot): Promise<void> {
  const redis = getRedis();
  if (!redis) throw new SiteHealthStoreUnavailableError();
  await redis.set(LATEST_KEY, snapshot, { ex: LATEST_TTL_SECONDS });
}

/** Throws when storage is unreachable so the queue can name the missing source. */
export async function readSiteHealth(): Promise<SiteHealthSnapshot | null> {
  const redis = getRedis();
  if (!redis) throw new SiteHealthStoreUnavailableError();
  return (await redis.get<SiteHealthSnapshot>(LATEST_KEY)) ?? null;
}
