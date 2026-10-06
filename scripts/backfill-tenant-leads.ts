#!/usr/bin/env npx tsx
/**
 * Copy client leads still in Redis into Postgres `tenant_leads`.
 *
 *   npx tsx scripts/backfill-tenant-leads.ts                    # dry run, every tenant (default)
 *   npx tsx scripts/backfill-tenant-leads.ts gldf               # dry run, one tenant
 *   npx tsx scripts/backfill-tenant-leads.ts --apply            # local database only
 *   npx tsx scripts/backfill-tenant-leads.ts --apply --i-have-jacobs-yes   # production, Jacob's call
 *
 * A dry run reads tenants (straight from Postgres, so no cache is refreshed),
 * each tenant's Redis lead window, and which lead ids Postgres already holds.
 * It writes nothing anywhere and sends nothing.
 *
 * --apply writes each missing lead through `record_tenant_lead` (the same RPC
 * the live dual-write uses), oldest first, and clears it from the failed-copy
 * list. It refuses unless SUPABASE_URL is a loopback host or
 * --i-have-jacobs-yes is passed. Reruns are no-ops for leads already copied.
 */
import { getSupabase } from "../src/platform/infra/db/client";
import { getAllTenants } from "../src/lib/tenants";
import { getRedisLeads as getLeads, leadSubmissionHash } from "../src/lib/leads";
import { clearLeadMirrorPending, mirrorLead } from "../src/lib/lead-mirror";
import { parseBackfillArgs, runLeadBackfill, type BackfillTenant } from "./tenant-lead-backfill";

async function tenants(): Promise<BackfillTenant[]> {
  const db = getSupabase();
  if (!db) return (await getAllTenants()).map((t) => ({ id: t.id, siteName: t.siteName }));
  const { data, error } = await db.from("tenants").select("id, site_name").order("id");
  if (error) throw new Error(`Tenant read failed: ${error.message}`);
  return (data ?? []).map((row) => ({ id: row.id, siteName: row.site_name }));
}

async function existing(tenantId: string): Promise<Set<string> | null> {
  const db = getSupabase() as unknown as { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }> } | null;
  if (!db) return null;
  const { data, error } = await db.rpc("read_tenant_leads", { p_tenant_id: tenantId, p_limit: 500, p_before: null });
  if (error) throw new Error(`Postgres lead read failed for ${tenantId}: ${error.message ?? "unknown"} (is 20261005090000_tenant_leads.sql applied?)`);
  return new Set((Array.isArray(data) ? data : []).map((row) => (row as { leadId?: string }).leadId).filter((id): id is string => typeof id === "string"));
}

async function main() {
  const options = parseBackfillArgs(process.argv.slice(2));
  const outcome = await runLeadBackfill({ ...options, databaseUrl: process.env.SUPABASE_URL }, {
    tenants,
    leads: (tenantId) => getLeads(tenantId, 500),
    existing: getSupabase() ? existing : null,
    write: (tenantId, lead) => mirrorLead(tenantId, lead, leadSubmissionHash(lead), { via: "backfill", timeoutMs: 10_000 }),
    clearPending: clearLeadMirrorPending,
    log: options.json ? () => undefined : (line) => console.log(line),
  });
  if (options.json) console.log(JSON.stringify(outcome, null, 2));
  if (outcome.totals.failed > 0) process.exitCode = 2;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
