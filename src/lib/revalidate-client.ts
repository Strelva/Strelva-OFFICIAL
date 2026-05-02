import { createRevalidationBody, signRevalidationBody } from "./reb-contracts";
import { getTenantConfig } from "./tenants";
import { getRedis } from "./redis";
import { alert } from "./monitoring";

export interface RevalidationFailure {
  tenantId: string;
  url: string;
  error: string;
  timestamp: string;
  attempts: number;
}

const FAILURES_KEY = "reb:revalidation:failures";
const MAX_FAILURES = 100;
const FAILURE_TTL_DAYS = 7;

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
  const config = await getTenantConfig(tenantId);

  if (!config?.revalidateUrl) {
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
