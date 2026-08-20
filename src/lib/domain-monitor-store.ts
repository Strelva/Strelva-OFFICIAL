/**
 * Domain-monitor store — persists the latest portfolio domain-health scan and
 * the last alert signature so the admin board renders instantly (no live scan
 * on every page load) and the cron only emails when the problem set changes.
 *
 * Null-safe: no Redis (dev) ⇒ reads return null and the board falls back to a
 * live scan. `reb:` persistent-data prefix per AGENTS.md.
 */

import { getRedis } from "./redis";
import type { TenantDomainHealth } from "./domain-monitor";

const LATEST_KEY = "reb:domain-monitor:latest";
const ALERT_SIG_KEY = "reb:domain-monitor:alert-sig";
/** Latest scan is a point-in-time signal; keep it for 30 days. */
const LATEST_TTL_SECONDS = 60 * 60 * 24 * 30;
/** Alert dedup state: long enough to hold across a persistent outage. */
const ALERT_TTL_SECONDS = 60 * 60 * 24 * 30;

export interface DomainHealthSnapshot {
  scannedAt: string;
  results: TenantDomainHealth[];
}

export async function saveDomainHealth(
  results: TenantDomainHealth[]
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const snapshot: DomainHealthSnapshot = {
    scannedAt: new Date().toISOString(),
    results,
  };
  try {
    await redis.set(LATEST_KEY, snapshot, { ex: LATEST_TTL_SECONDS });
  } catch {
    // persistence is best-effort; a failed write must never break the scan
  }
}

export async function getDomainHealth(): Promise<DomainHealthSnapshot | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    return (await redis.get<DomainHealthSnapshot>(LATEST_KEY)) ?? null;
  } catch {
    return null;
  }
}

export async function getAlertSignature(): Promise<string | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    return (await redis.get<string>(ALERT_SIG_KEY)) ?? null;
  } catch {
    return null;
  }
}

export async function setAlertSignature(signature: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(ALERT_SIG_KEY, signature, { ex: ALERT_TTL_SECONDS });
  } catch {
    // best-effort
  }
}
