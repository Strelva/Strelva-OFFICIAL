/**
 * Weekly site-audit snapshot cron.
 *
 * For each active tenant with a usable live URL:
 * - Resolves the public URL (primary custom domain, else stored siteUrl)
 * - Runs the same free site-health engine that powers the dashboard card
 * - Computes the overall score + letter grade
 * - Saves a SLIM `audit_snapshot` event (score/grade + per-category score) so the
 *   dashboard can render a health trend over time
 *
 * Auth: handled by the proxy (CRON_SECRET check), same pattern as other crons.
 * Per-tenant error isolation: one tenant's failure never blocks the others.
 * Tenants with no usable URL are skipped (recorded honestly), not errored.
 * Schedule: weekly, Sunday 12:00 UTC.
 */

import { NextResponse } from "next/server";
import { recordHeartbeat } from "@/lib/heartbeat";
import { mapPool } from "@/lib/concurrency";
import { getAllTenants } from "@/lib/tenants";
import { getTenantPrimaryDomain } from "@/lib/tenant-urls";
import { runAudit } from "@/lib/audit/checks";
import { computeOverallScore, scoreToGrade } from "@/lib/audit/scoring";
import { saveAuditSnapshot } from "@/lib/audit/history";
import type { TenantConfig } from "@/lib/types";

interface TenantAuditResult {
  tenantId: string;
  status: "ok" | "skipped" | "error";
  reason?: string;
  url?: string;
  overallScore?: number;
  grade?: string;
}

/** Best public URL to audit: the primary custom domain, else the stored siteUrl. */
function resolveSiteUrl(config: TenantConfig): string | null {
  const primary = getTenantPrimaryDomain(config);
  if (primary) return `https://${primary}`;
  const siteUrl = config.siteUrl?.trim();
  if (siteUrl) return /^https?:\/\//i.test(siteUrl) ? siteUrl : `https://${siteUrl}`;
  return null;
}

export async function GET() {
  // Auth handled by proxy (CRON_SECRET check)

  const tenants = await getAllTenants();
  const active = tenants.filter((t) => t.active);

  const results: TenantAuditResult[] = [];

  await mapPool(active, 4, async (tenant) => {
    const target = resolveSiteUrl(tenant);
    if (!target) {
      results.push({ tenantId: tenant.id, status: "skipped", reason: "no_usable_url" });
      return;
    }

    try {
      const categories = await runAudit(target);
      const overallScore = computeOverallScore(categories);
      const grade = scoreToGrade(overallScore);

      await saveAuditSnapshot(tenant.id, {
        url: target,
        overallScore,
        grade,
        categories,
      });

      console.log(
        `[site-audit-cron] ${tenant.id}: ${grade} (${overallScore}) for ${target}`
      );

      results.push({
        tenantId: tenant.id,
        status: "ok",
        url: target,
        overallScore,
        grade,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[site-audit-cron] Failed for tenant ${tenant.id}:`, err);
      results.push({ tenantId: tenant.id, status: "error", reason: msg, url: target });
    }
  });

  const ok = results.filter((r) => r.status === "ok").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const errors = results.filter((r) => r.status === "error").length;

  console.log(
    `[site-audit-cron] Done. ok=${ok} skipped=${skipped} errors=${errors} (of ${active.length} active)`
  );

  // Notify Slack on errors (matches the visibility cron's pattern).
  if (errors > 0 && process.env.SLACK_WEBHOOK_URL) {
    const errorList = results
      .filter((r) => r.status === "error")
      .map((r) => `${r.tenantId}: ${r.reason}`)
      .join(", ");
    await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `Site-audit cron: ${errors} tenant(s) failed — ${errorList}` }),
    }).catch(() => {});
  }

  await recordHeartbeat("site-audit", { ok: errors === 0, processed: ok, failed: errors });

  return NextResponse.json({ ok, skipped, errors, results });
}
