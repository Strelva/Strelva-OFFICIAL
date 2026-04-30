import { getTenantConfig } from "./tenants";

// In-memory store for recent failures (last 100)
export interface RevalidationFailure {
  tenantId: string;
  url: string;
  error: string;
  timestamp: string;
  attempts: number;
}

const MAX_FAILURES = 100;
const recentFailures: RevalidationFailure[] = [];

export function getRecentFailures(): RevalidationFailure[] {
  return [...recentFailures];
}

function recordFailure(failure: RevalidationFailure) {
  recentFailures.unshift(failure);
  if (recentFailures.length > MAX_FAILURES) {
    recentFailures.pop();
  }
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

  // Use tenant-specific secret, no fallback to global
  const secret = config.revalidationSecret;
  const maxRetries = 2;
  let lastError: string | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await sleep(1000);
    }

    try {
      const response = await fetch(config.revalidateUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-Id": tenantId,
          ...(secret && { "X-Revalidation-Secret": secret }),
        },
        body: JSON.stringify({
          tenant: tenantId,
          paths,
          timestamp: new Date().toISOString(),
        }),
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

  // All retries exhausted - record failure
  recordFailure({
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
