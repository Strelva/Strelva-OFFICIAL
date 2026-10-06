#!/usr/bin/env npx tsx
/**
 * Move client stores out of Redis into Postgres `tenant_client_records`.
 *
 *   npx tsx scripts/client-records-move.ts backfill                     # dry run, every store and tenant
 *   npx tsx scripts/client-records-move.ts backfill gldf --store=spam_held
 *   npx tsx scripts/client-records-move.ts backfill --apply             # local database only
 *   npx tsx scripts/client-records-move.ts backfill --apply --i-have-jacobs-yes   # production, Jacob's call
 *   npx tsx scripts/client-records-move.ts parity                       # compare and record (local only)
 *
 * A backfill dry run reads Redis and writes nothing anywhere. --apply writes
 * through `record_tenant_client_record`, the RPC the dual-write uses; reruns
 * are no-ops. Parity records one result per store, tenant and day; a store's
 * read flag (STRELVA_CLIENT_RECORDS_READ) only takes effect after 7 days in a
 * row. Needs 20261007181000_tenant_client_records.sql applied.
 */
import { getSupabase } from "../src/lib/db/client";
import { getAllTenants } from "../src/lib/tenants";
import { backfillClientRecords, checkClientRecordParity } from "../src/platform/client-records/move";
import { parseMoveArgs, runClientRecordMove } from "./client-records-move-plan";

async function tenants(): Promise<string[]> {
  const db = getSupabase();
  if (!db) return (await getAllTenants()).map((t) => t.id);
  const { data, error } = await db.from("tenants").select("id").order("id");
  if (error) throw new Error(`Tenant read failed: ${error.message}`);
  return (data ?? []).map((row) => row.id);
}

async function main() {
  const options = parseMoveArgs(process.argv.slice(2));
  const outcome = await runClientRecordMove({ ...options, databaseUrl: process.env.SUPABASE_URL }, {
    tenants,
    backfill: (store, tenant, apply) => backfillClientRecords(store, tenant, { apply }),
    parity: (store, tenant) => checkClientRecordParity(store, tenant),
    log: options.json ? () => undefined : (line) => console.log(line),
  });
  if (options.json) console.log(JSON.stringify(outcome, null, 2));
  else console.log(`${outcome.command}${outcome.apply ? "" : " (dry run)"} on ${outcome.database} database: ${JSON.stringify(outcome.totals)}`);
  if (outcome.totals.failed > 0 || outcome.totals.outOfParity > 0) process.exitCode = 2;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
