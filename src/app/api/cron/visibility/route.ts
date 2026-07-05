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
import { recordHeartbeat } from "@/lib/heartbeat";
import { alertOnce } from "@/lib/monitoring";
import { selectRunWindow } from "@/lib/visibility/schedule";
import { mapPool } from "@/lib/concurrency";
import { getAllTenants } from "@/lib/tenants";
import { buildSerpProvider, DEFAULT_QUERIES_PER_WEEK, computeMonthlyCost } from "@/lib/visibility/serp";
import type { SerpResult } from "@/lib/visibility/serp";
import { probeAiAnswer, buildVisibilityQueries } from "@/lib/visibility/ai-answers";
import type { AiAnswerResult } from "@/lib/visibility/ai-answers";
import { saveVisibilitySnapshot } from "@/lib/visibility/snapshots";
import type { VisibilitySnapshot } from "@/lib/visibility/snapshots";

// Cap matches the platform function ceiling — this cron iterates tenants and
// would otherwise die mid-batch at scale on a lower default.
export const maxDuration = 300;

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

  // Budget guard: visibility cost scales per-tenant (serper.dev + Gemini per
  // query). Cap how many tenants a single weekly run will probe so an
  // unexpected tenant spike can't run up an unbounded external bill. Past this
  // ceiling, move to a queue (QStash) — see docs/operations.md.
  //
  // The cap ROTATES by week so a tenant past the cap isn't starved forever —
  // every tenant is covered over ceil(n/cap) weeks — and a deferred run pages
  // (deduped) so the cap can never silently drop tenants.
  const MAX_TENANTS_PER_RUN = Number(process.env.VISIBILITY_MAX_TENANTS_PER_RUN || 50);
  const weekIndex = Math.floor(Date.now() / (7 * 24 * 3600 * 1000));
  const { toRun, deferred, windowCount, windowIndex } = selectRunWindow(
    active,
    MAX_TENANTS_PER_RUN,
    weekIndex
  );
  if (deferred > 0) {
    console.warn(
      `[visibility-cron] tenant cap hit: probing ${toRun.length}/${active.length} ` +
      `(window ${windowIndex}/${windowCount}), ${deferred} deferred this week`
    );
    await alertOnce(
      "visibility_tenant_cap_hit",
      "medium",
      { active: active.length, perRun: MAX_TENANTS_PER_RUN, windows: windowCount },
      7 * 24 * 3600
    );
  }

  const results: TenantVisibilityResult[] = [];
  let totalEstimatedCostUsd = 0;

  await mapPool(toRun, 4, async (tenant) => {
    const cfg = tenant.visibility;

    // Explicit opt-out is always honored — never override a client who turned this off.
    if (cfg?.enabled === false) {
      console.log(`[visibility-cron] SKIP ${tenant.id}: disabled_in_config`);
      results.push({ tenantId: tenant.id, status: "skipped", reason: "disabled_in_config" });
      return;
    }

    // Derive probe inputs from real tenant fields so a tenant that never had a
    // `visibility` block hand-set still collects wedge data. `trade` falls back to
    // the tenant's declared `industry` — a real field, not a guess. `towns` MUST be
    // real: we NEVER invent a service area, because a wrong town corrupts the wedge
    // data. A tenant with no real town is flagged for an operator, not probed blind.
    const trade = (cfg?.trade || tenant.industry || "").trim();
    const towns = (cfg?.towns ?? []).map((t) => t.trim()).filter(Boolean);

    if (!trade || towns.length === 0) {
      const missing = [!trade ? "trade" : null, towns.length === 0 ? "towns" : null]
        .filter(Boolean)
        .join("+");
      // Do NOT skip silently — log which tenant and why so the gap is visible in
      // the cron output, and surface it to an operator below (never a no-op).
      console.warn(
        `[visibility-cron] SKIP ${tenant.id}: no probe inputs (missing ${missing}; ` +
        `industry=${JSON.stringify(tenant.industry ?? "")}, towns=${towns.length}) — ` +
        `set tenant.visibility.${!trade ? "trade" : "towns"} to probe`
      );
      results.push({ tenantId: tenant.id, status: "skipped", reason: `missing_${missing}` });
      return;
    }

    try {
      const queriesPerWeek = cfg?.queriesPerWeek ?? DEFAULT_QUERIES_PER_WEEK;
      const queries = buildVisibilityQueries(trade, towns, queriesPerWeek);
      const competitors = cfg?.competitors ?? [];

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
        trade,
        towns,
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
  });

  const ok = results.filter((r) => r.status === "ok").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const errors = results.filter((r) => r.status === "error").length;

  // A tenant that can't be probed for lack of a real trade/town is a wedge-data
  // gap, not a no-op. Surface the list to an operator (deduped, non-paging) so the
  // config gap gets closed instead of quietly starving the wedge.
  const unconfigured = results.filter(
    (r) => r.status === "skipped" && r.reason?.startsWith("missing_")
  );
  if (unconfigured.length > 0) {
    const ids = unconfigured.map((r) => r.tenantId);
    console.warn(
      `[visibility-cron] ${unconfigured.length} tenant(s) have no probe inputs ` +
      `(missing trade/towns): ${ids.join(", ")}`
    );
    await alertOnce(
      "visibility_tenants_unconfigured",
      "medium",
      { count: unconfigured.length, tenantIds: ids.join(",") },
      24 * 3600
    );
  }

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

  await recordHeartbeat("visibility", { ok: errors === 0, processed: ok, failed: errors });

  return NextResponse.json({
    ok,
    deferred,
    skipped,
    unconfigured: unconfigured.length,
    errors,
    totalEstimatedMonthlyCostUsd: parseFloat(totalEstimatedCostUsd.toFixed(4)),
    results,
  });
}
