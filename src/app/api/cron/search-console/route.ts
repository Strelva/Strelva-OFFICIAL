import { NextResponse } from "next/server";
import { recordHeartbeat } from "@/platform/infra/heartbeat";
import { mapPool } from "@/lib/concurrency";
import { getAllTenants } from "@/lib/tenants";
import { fetchSearchData, fetchSearchDataWithStatus } from "@/lib/search-console";
import { catalogReportsMayBeOn } from "@/platform/catalog-reports/receipts";
import { recordSearchConnection } from "@/platform/catalog-reports/search-connection";
import { tenantReleaseFlagEnabled } from "@/platform/release-flags/store";
import { setSearchData } from "@/lib/storage";
import { generateSuggestionsForTenant } from "@/lib/suggestions";
import { requireCronRequest } from "@/lib/cron-auth";

// Cap matches the platform function ceiling — this cron iterates tenants and
// would otherwise die mid-batch at scale on a lower default.
export const maxDuration = 300;

export async function GET(request: Request) {
  const denied = requireCronRequest(request);
  if (denied) return denied;

  const tenants = await getAllTenants();
  const active = tenants.filter((t) => t.active && t.siteUrl);
  const results: { tenant: string; clicks: number; queries: number }[] = [];
  const errors: string[] = [];

  await mapPool(active, 8, async (tenant) => {
    try {
      const catalog = catalogReportsMayBeOn() && await tenantReleaseFlagEnabled("catalog_reports", tenant.id).catch(() => false);
      const read = catalog ? await fetchSearchDataWithStatus(tenant.siteUrl!, 7, tenant) : null;
      const data = read?.data ?? await fetchSearchData(tenant.siteUrl!);
      if (read) await recordSearchConnection(tenant.id, read.status, read.status === "available" ? { clicks: data.totalClicks, impressions: data.totalImpressions } : null);
      await setSearchData(tenant.id, data);

      if (data.queries.length > 0) {
        await generateSuggestionsForTenant(tenant.id);
      }

      results.push({
        tenant: tenant.id,
        clicks: data.totalClicks,
        queries: data.queries.length,
      });
    } catch (err) {
      const msg = `${tenant.id}: ${err instanceof Error ? err.message : "Unknown error"}`;
      console.error(`[search-console] Failed for tenant ${tenant.id}:`, err);
      errors.push(msg);
    }
  });

  // Notify Slack if any tenants failed
  if (errors.length > 0 && process.env.SLACK_WEBHOOK_URL) {
    await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `⚠ Search console cron: ${errors.length} tenant(s) failed — ${errors.join(", ")}`,
      }),
    }).catch(() => {});
  }

  await recordHeartbeat("search-console", { ok: errors.length === 0, processed: results.length, failed: errors.length });

  return NextResponse.json({ processed: results.length, failed: errors.length, results, errors });
}
