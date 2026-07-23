#!/usr/bin/env npx tsx
/**
 * Parity check for the site_metric_summary RPC (audit #4). For every tenant with
 * metrics, compares each metric's RPC total against a direct row sum. For a
 * tenant under the 1,000-row cap these MUST match exactly (verifies the RPC
 * computes the same numbers); a tenant above the cap is where the RPC is the fix
 * (the direct sum would be truncated) — flagged, not failed.
 *
 * Run: npx tsx --env-file=.env.local scripts/verify-metric-summary.ts
 */
import { getSupabase } from "../src/lib/db/client";

async function main() {
  const db = getSupabase();
  if (!db) throw new Error("no supabase client (env not loaded?)");
  const today = new Date().toISOString().slice(0, 10);

  const { data: tenantRows, error: tErr } = await db.from("site_metrics").select("tenant_id");
  if (tErr) throw tErr;
  const tenants = [...new Set((tenantRows ?? []).map((r: { tenant_id: string }) => r.tenant_id))];
  console.log(`Tenants with metrics: ${tenants.length}\n`);

  let mismatches = 0;
  let capFlags = 0;
  for (const tenant of tenants) {
    // RPC totals
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rpc, error } = await (db.rpc as any)("site_metric_summary", { p_tenant_id: tenant, p_today: today });
    if (error) { console.log(`  ${tenant}: RPC ERROR ${error.message}`); mismatches++; continue; }
    const rpcTotals = new Map<string, number>();
    for (const r of (rpc ?? []) as Array<{ metric: string; total: number }>) rpcTotals.set(r.metric, Number(r.total));

    // Direct row sum (subject to the 1000-row cap — that's the point).
    const { data: raw } = await db.from("site_metrics").select("metric, count").eq("tenant_id", tenant);
    const rows = (raw ?? []) as Array<{ metric: string; count: number }>;
    const capped = rows.length >= 1000;
    const directTotals = new Map<string, number>();
    for (const r of rows) directTotals.set(r.metric, (directTotals.get(r.metric) ?? 0) + r.count);

    const metrics = new Set([...rpcTotals.keys(), ...directTotals.keys()]);
    const diffs: string[] = [];
    for (const m of metrics) {
      const a = rpcTotals.get(m) ?? 0;
      const b = directTotals.get(m) ?? 0;
      if (a !== b) diffs.push(`${m}: rpc=${a} direct=${b}`);
    }
    if (capped) {
      capFlags++;
      console.log(`  ${tenant}: OVER cap (${rows.length} rows) — RPC is the source of truth; direct sum truncated${diffs.length ? ` (${diffs.length} expected diffs)` : ""}`);
    } else if (diffs.length) {
      mismatches++;
      console.log(`  ${tenant}: MISMATCH — ${diffs.join(", ")}`);
    } else {
      console.log(`  ${tenant}: ok (${rows.length} rows, ${metrics.size} metrics)`);
    }
  }

  console.log(`\nResult: ${mismatches} mismatch(es), ${capFlags} over-cap tenant(s).`);
  process.exit(mismatches ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
