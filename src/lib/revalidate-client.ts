import { getTenantConfig } from "./tenants";

const REVALIDATION_SECRET = process.env.REVALIDATION_SECRET;

export async function revalidateClientSite(
  tenantId: string,
  paths: string[] | "all" = "all"
): Promise<{ success: boolean; error?: string; skipped?: boolean }> {
  const config = await getTenantConfig(tenantId);

  if (!config?.revalidateUrl) {
    return { success: true, skipped: true };
  }

  try {
    const response = await fetch(config.revalidateUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-Id": tenantId,
        ...(REVALIDATION_SECRET && { "X-Revalidation-Secret": REVALIDATION_SECRET }),
      },
      body: JSON.stringify({
        tenant: tenantId,
        paths,
        timestamp: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        success: false,
        error: `HTTP ${response.status}: ${text.slice(0, 200)}`,
      };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
