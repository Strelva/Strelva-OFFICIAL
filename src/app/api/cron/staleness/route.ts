import { NextResponse } from "next/server";
import { getAllTenants } from "@/lib/tenants";
import { generateSuggestionsForTenant } from "@/lib/suggestions";

export async function GET() {
  // Auth handled by proxy (CRON_SECRET check)

  const tenants = await getAllTenants();
  const active = tenants.filter((t) => t.active);
  const processed: string[] = [];
  const errors: string[] = [];

  for (const tenant of active) {
    try {
      await generateSuggestionsForTenant(tenant.id);
      processed.push(tenant.id);
    } catch (err) {
      const msg = `${tenant.id}: ${err instanceof Error ? err.message : "Unknown error"}`;
      console.error(`[staleness] Failed for tenant ${tenant.id}:`, err);
      errors.push(msg);
    }
  }

  // Notify Slack if any tenants failed
  if (errors.length > 0 && process.env.SLACK_WEBHOOK_URL) {
    await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `⚠ Staleness cron: ${errors.length} tenant(s) failed — ${errors.join(", ")}`,
      }),
    }).catch(() => {});
  }

  return NextResponse.json({ processed: processed.length, failed: errors.length, errors });
}
