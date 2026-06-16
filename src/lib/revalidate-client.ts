import { createRevalidationBody, signRevalidationBody } from "./scaffold-contracts";
import { getTenantConfig, getActiveTenants } from "./tenants";
import { getTenantDeliveryModel } from "./custom-repos";
import { getRedis } from "./redis";
import { alert } from "./monitoring";
import { getSectionTimestamps } from "./storage";
import { logger } from "./logger";
import { addSentryBreadcrumb } from "./sentry-context";

export interface RevalidationFailure {
  tenantId: string;
  url: string;
  error: string;
  timestamp: string;
  attempts: number;
}

export interface ReconciliationResult {
  tenantId: string;
  action: "skipped" | "up_to_date" | "revalidated" | "failed";
  latestContentAt?: string;
  lastRevalidatedAt?: string;
  error?: string;
}

const FAILURES_KEY = "reb:revalidation:failures";
const MAX_FAILURES = 100;
const FAILURE_TTL_DAYS = 7;
const LAST_REVALIDATION_PREFIX = "reb:revalidation:last-success:";

export async function getRecentFailures(): Promise<RevalidationFailure[]> {
  const redis = getRedis();
  if (!redis) return [];

  try {
    const raw = await redis.zrange(FAILURES_KEY, 0, MAX_FAILURES - 1, { rev: true });
    return raw.map((item) => (typeof item === "string" ? JSON.parse(item) : item) as RevalidationFailure);
  } catch {
    return [];
  }
}

async function recordFailure(failure: RevalidationFailure): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    const score = Date.now();
    await redis.zadd(FAILURES_KEY, { score, member: JSON.stringify(failure) });

    const count = await redis.zcard(FAILURES_KEY);
    if (count > MAX_FAILURES) {
      await redis.zremrangebyrank(FAILURES_KEY, 0, count - MAX_FAILURES - 1);
    }

    const cutoff = Date.now() - FAILURE_TTL_DAYS * 24 * 60 * 60 * 1000;
    await redis.zremrangebyscore(FAILURES_KEY, 0, cutoff);
  } catch {}

  if (process.env.SLACK_WEBHOOK_URL) {
    fetch(process.env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `Revalidation failed for *${failure.tenantId}* after ${failure.attempts} attempts: ${failure.error}`,
      }),
    }).catch(() => {});
  }

  alert("revalidation_failed", "high", { ...failure });
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function revalidateClientSite(
  tenantId: string,
  paths: string[] | "all" = "all"
): Promise<{ success: boolean; error?: string; skipped?: boolean }> {
  addSentryBreadcrumb("webhook", "Revalidation webhook delivery", { tenantId, paths: paths === "all" ? "all" : paths.join(",") });
  const config = await getTenantConfig(tenantId);

  if (!config?.revalidateUrl) {
    // A custom-repo tenant with no revalidateUrl can't be revalidated — its
    // site would silently go stale. Record it as a failure so it shows on the
    // ops board instead of being a silent skip. A legacy template tenant
    // legitimately has no revalidateUrl, so only flag custom-repo tenants.
    if (config && getTenantDeliveryModel(config) === "custom_repo") {
      await recordFailure({
        tenantId,
        url: "(missing revalidateUrl)",
        error: "Custom-repo tenant has no revalidateUrl configured",
        timestamp: new Date().toISOString(),
        attempts: 0,
      });
      return { success: false, error: "Missing revalidateUrl" };
    }
    return { success: true, skipped: true };
  }

  const secret = config.revalidationSecret;
  if (!secret) {
    const error = "Missing tenant revalidationSecret";
    await recordFailure({
      tenantId,
      url: config.revalidateUrl,
      error,
      timestamp: new Date().toISOString(),
      attempts: 0,
    });
    return { success: false, error };
  }

  const maxRetries = 2;
  let lastError: string | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await sleep(1000);
    }

    try {
      const body = createRevalidationBody(
        paths === "all"
          ? { tenant: tenantId, all: true }
          : { tenant: tenantId, paths }
      );
      const signed = signRevalidationBody(body, secret);

      const response = await fetch(config.revalidateUrl, {
        method: "POST",
        headers: signed.headers,
        body: signed.body,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        lastError = `HTTP ${response.status}: ${text.slice(0, 200)}`;
        console.error(
          `[Revalidation] Attempt ${attempt + 1}/${maxRetries + 1} failed for tenant ${tenantId} (${config.revalidateUrl}): ${lastError}`
        );
        continue;
      }

      await recordSuccessfulRevalidation(tenantId);
      return { success: true };
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Unknown error";
      console.error(
        `[Revalidation] Attempt ${attempt + 1}/${maxRetries + 1} failed for tenant ${tenantId} (${config.revalidateUrl}): ${lastError}`
      );
    }
  }

  await recordFailure({
    tenantId,
    url: config.revalidateUrl,
    error: lastError || "Unknown error",
    timestamp: new Date().toISOString(),
    attempts: maxRetries + 1,
  });

  return {
    success: false,
    error: lastError,
  };
}

// ---------------------------------------------------------------------------
// Revalidation timestamp tracking
// ---------------------------------------------------------------------------

async function recordSuccessfulRevalidation(tenantId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(
      `${LAST_REVALIDATION_PREFIX}${tenantId}`,
      new Date().toISOString(),
      { ex: 30 * 24 * 60 * 60 } // 30-day TTL
    );
  } catch {
    // Non-fatal — next reconciliation run will still catch drift
  }
}

export async function getLastSuccessfulRevalidation(
  tenantId: string
): Promise<string | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    return await redis.get<string>(`${LAST_REVALIDATION_PREFIX}${tenantId}`);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Reconciliation: detect and re-sync stale custom repos
// ---------------------------------------------------------------------------

export async function reconcileRevalidations(): Promise<ReconciliationResult[]> {
  const tenants = await getActiveTenants();
  const results: ReconciliationResult[] = [];

  for (const tenant of tenants) {
    if (!tenant.revalidateUrl || !tenant.revalidationSecret) {
      continue; // Not a custom repo with revalidation
    }

    try {
      const timestamps = await getSectionTimestamps(tenant.id);
      const latestContentAt = Object.values(timestamps).reduce<string | null>(
        (latest, ts) => (!latest || ts > latest ? ts : latest),
        null
      );

      if (!latestContentAt) {
        results.push({ tenantId: tenant.id, action: "skipped" });
        continue;
      }

      const lastRevalidatedAt = await getLastSuccessfulRevalidation(tenant.id);

      // If we have no record of successful revalidation, or content is newer.
      // Compare as parsed timestamps, not raw strings — a lexicographic ISO
      // compare silently mis-orders if the two values ever differ in zone/format
      // (e.g. "+00:00" vs "Z"), which would report a stale site as up_to_date.
      if (!lastRevalidatedAt || Date.parse(latestContentAt) > Date.parse(lastRevalidatedAt)) {
        logger.info("[reconcile] Stale repo detected, re-firing revalidation", {
          tenantId: tenant.id,
          latestContentAt,
          lastRevalidatedAt: lastRevalidatedAt || "never",
        });

        const result = await revalidateClientSite(tenant.id, "all");

        if (result.success) {
          results.push({
            tenantId: tenant.id,
            action: "revalidated",
            latestContentAt,
            lastRevalidatedAt: lastRevalidatedAt || undefined,
          });
        } else {
          results.push({
            tenantId: tenant.id,
            action: "failed",
            latestContentAt,
            lastRevalidatedAt: lastRevalidatedAt || undefined,
            error: result.error,
          });
        }
      } else {
        results.push({
          tenantId: tenant.id,
          action: "up_to_date",
          latestContentAt,
          lastRevalidatedAt,
        });
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : "Unknown error";
      logger.error("[reconcile] Failed for tenant", { tenantId: tenant.id, error });
      results.push({ tenantId: tenant.id, action: "failed", error });
    }
  }

  return results;
}
