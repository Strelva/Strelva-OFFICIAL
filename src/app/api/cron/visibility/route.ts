/**
 * Weekly visibility snapshot cron.
 *
 * For each active tenant with a `visibility` config block:
 * - Builds queries from trade + towns (default 3 queries/week)
 * - Runs SERP checks via the configured provider (skips with honest log if no key)
 * - Runs AI-answer probes via Gemini (skips honestly if no key)
 * - Saves a visibility_snapshot event
 * - Logs estimated monthly cost per tenant
 *
 * Auth: handled by proxy (CRON_SECRET check), same pattern as other crons.
 * Per-tenant error isolation: one tenant's failure never blocks others.
 * Schedule: weekly, Tuesday 03:00 UTC (off-peak, day after weekly report).
 */

import { NextResponse } from "next/server";
import { getAllTenants } from "@/lib/tenants";
import { buildSerpProvider, DEFAULT_QUERIES_PER_WEEK, computeMonthlyCost } from "@/lib/visibility/serp";
import type { SerpResult } from "@/lib/visibility/serp";
import { probeAiAnswer, buildVisibilityQueries } from "@/lib/visibility/ai-answers";
import type { AiAnswerResult } from "@/lib/visibility/ai-answers";
import { saveVisibilitySnapshot } from "@/lib/visibility/snapshots";
import type { VisibilitySnapshot } from "@/lib/visibility/snapshots";

interface TenantVisibilityResult {
  tenantId: string;
  status: "ok" | "skipped" | "error";
  reason?: string;
  serpChecks?: number;
  aiChecks?: number;
  estimatedMonthlyCostUsd?: number;
}

export async function GET() {
  // Auth handled by proxy (CRON_SECRET check)

  const serpProvider = buildSerpProvider();
  if (!serpProvider) {
    console.log("[visibility-cron] SERP_API_KEY not set — SERP checks will be skipped (recorded honestly per tenant)");
  }

  const tenants = await getAllTenants();
  const active = tenants.filter((t) => t.active);

  const results: TenantVisibilityResult[] = [];
  let totalEstimatedCostUsd = 0;

  for (const tenant of active) {
    const cfg = tenant.visibility;

    if (!cfg) {
      results.push({ tenantId: tenant.id, status: "skipped", reason: "no_visibility_config" });
      continue;
    }

    if (cfg.enabled === false) {
      results.push({ tenantId: tenant.id, status: "skipped", reason: "disabled_in_config" });
      continue;
    }

    if (!cfg.trade || !cfg.towns?.length) {
      results.push({ tenantId: tenant.id, status: "skipped", reason: "missing_trade_or_towns" });
      continue;
    }

    try {
      const queriesPerWeek = cfg.queriesPerWeek ?? DEFAULT_QUERIES_PER_WEEK;
      const queries = buildVisibilityQueries(cfg.trade, cfg.towns, queriesPerWeek);
      const competitors = cfg.competitors ?? [];

      // SERP checks
      const serpResults: SerpResult[] = [];
      for (const query of queries) {
        if (serpProvider) {
          const result = await serpProvider.search(
            query,
            tenant.siteName,
            tenant.siteUrl ?? tenant.customRepo?.productionUrl,
            competitors
          );
          serpResults.push(result);
        } else {
          serpResults.push({
            query,
            provider: "none",
            tenantPosition: null,
            tenantInLocalPack: false,
            competitors: competitors.map((c) => ({ name: c.name, position: null, inLocalPack: false })),
            checkedAt: new Date().toISOString(),
            skipped: true,
            skipReason: "SERP_API_KEY not configured",
          });
        }
      }

      // AI-answer probes
      const aiResults: AiAnswerResult[] = [];
      for (const query of queries) {
        const result = await probeAiAnswer(query, tenant.siteName, competitors);
        aiResults.push(result);
      }

      const estimatedMonthlyCostUsd = computeMonthlyCost(queriesPerWeek);
      totalEstimatedCostUsd += estimatedMonthlyCostUsd;

      const snapshot: VisibilitySnapshot = {
        tenantId: tenant.id,
        trade: cfg.trade,
        towns: cfg.towns,
        queriesPerWeek,
        serpResults,
        aiResults,
        provider: serpProvider?.name ?? "none",
        checkedAt: new Date().toISOString(),
        estimatedMonthlyCostUsd,
      };

      await saveVisibilitySnapshot(snapshot);

      console.log(
        `[visibility-cron] ${tenant.id}: ${serpResults.length} SERP + ${aiResults.length} AI checks done. ` +
        `Est. cost: $${estimatedMonthlyCostUsd}/mo`
      );

      results.push({
        tenantId: tenant.id,
        status: "ok",
        serpChecks: serpResults.length,
        aiChecks: aiResults.length,
        estimatedMonthlyCostUsd,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[visibility-cron] Failed for tenant ${tenant.id}:`, err);
      results.push({ tenantId: tenant.id, status: "error", reason: msg });
    }
  }

  const ok = results.filter((r) => r.status === "ok").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const errors = results.filter((r) => r.status === "error").length;

  console.log(
    `[visibility-cron] Done. ok=${ok} skipped=${skipped} errors=${errors} ` +
    `totalEstCostUsd=${totalEstimatedCostUsd.toFixed(4)}`
  );

  // Notify Slack on errors
  if (errors > 0 && process.env.SLACK_WEBHOOK_URL) {
    const errorList = results
      .filter((r) => r.status === "error")
      .map((r) => `${r.tenantId}: ${r.reason}`)
      .join(", ");
    await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `Visibility cron: ${errors} tenant(s) failed — ${errorList}`,
      }),
    }).catch(() => {});
  }

  return NextResponse.json({
    ok,
    skipped,
    errors,
    totalEstimatedMonthlyCostUsd: parseFloat(totalEstimatedCostUsd.toFixed(4)),
    results,
  });
}
