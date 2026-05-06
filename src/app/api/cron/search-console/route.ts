import { NextResponse } from "next/server";
import { getAllTenants } from "@/lib/tenants";
import { fetchSearchData } from "@/lib/search-console";
import { setSearchData } from "@/lib/storage";
import { generateSuggestionsForTenant } from "@/lib/suggestions";

export async function GET() {
  // Auth handled by proxy (CRON_SECRET check)

  const tenants = await getAllTenants();
  const active = tenants.filter((t) => t.active && t.siteUrl);
  const results: { tenant: string; clicks: number; queries: number }[] = [];
  const errors: string[] = [];

  for (const tenant of active) {
    try {
      const data = await fetchSearchData(tenant.siteUrl!);
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
  }

  // Notify Slack if any tenants failed
  if (errors.length > 0 && process.env.SLACK_WEBHOOK_URL) {
    fetch(process.env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `⚠ Search console cron: ${errors.length} tenant(s) failed — ${errors.join(", ")}`,
      }),
    }).catch(() => {});
  }

  return NextResponse.json({ processed: results.length, failed: errors.length, results, errors });
}
