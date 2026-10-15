#!/usr/bin/env npx tsx
/**
 * One-time copy of legacy Redis pay links into Postgres agency_pay_links.
 *
 *   npx tsx scripts/pay-links-backfill.ts [--legacy-agency=<uuid>] [--apply] [--i-have-jacobs-yes] [--verify] [--json]
 *
 * Without --apply this reads Redis and writes nothing. --apply refuses a
 * non-local database without --i-have-jacobs-yes, and refuses links with no
 * owning agency unless --legacy-agency names one (Jacob's choice). --verify
 * compares Redis with Postgres and writes nothing. Reruns are no-ops. Redis
 * command receipts (reb:paylink:command:*) are intentionally not migrated.
 * Switch reads with STRELVA_PAY_LINK_STORE=postgres only after --verify is clean.
 * Needs 20261026180000_money_agency_pay_links.sql applied.
 */
import { connectDb } from "../src/platform/connect";
import { listRedisPayLinks, type PayLinkConfig } from "../src/platform/infra/pay-links";
import { agencyPayLinkSchema } from "../src/platform/agency-pay-links/types";
import { toLegacyPayLinkConfig } from "../src/platform/agency-pay-links";
import { parseBackfillArgs, runBackfill } from "./pay-links-backfill-plan";
import { z } from "zod";

function db() {
  const client = connectDb();
  if (!client) throw new Error("No database is configured.");
  return client;
}

async function main() {
  const options = parseBackfillArgs(process.argv.slice(2));
  const outcome = await runBackfill({ ...options, databaseUrl: process.env.SUPABASE_URL }, {
    list: listRedisPayLinks,
    write: async (record: PayLinkConfig, hash, legacyAgency) => {
      const { data, error } = await db().rpc("backfill_legacy_agency_pay_link", { p_record: record, p_source_hash: hash, p_legacy_agency: legacyAgency });
      if (error) throw new Error(`Backfill of ${record.slug} failed: ${error.message}`);
      return z.enum(["inserted", "unchanged", "conflict"]).parse(data);
    },
    stored: async () => {
      const { data, error } = await db().rpc("list_agency_pay_links_for_support", {});
      if (error) throw new Error(`Postgres read failed: ${error.message}`);
      return z.array(agencyPayLinkSchema).parse(data).filter((row) => row.rail === "platform_legacy").map(toLegacyPayLinkConfig);
    },
    log: options.json ? () => undefined : (line) => console.log(line),
  });
  if (options.json) console.log(JSON.stringify(outcome, null, 2));
  else console.log(`${outcome.mode} on ${outcome.database} database: ${JSON.stringify({ total: outcome.total, inserted: outcome.inserted, unchanged: outcome.unchanged, conflicts: outcome.conflicts, missing: outcome.missing.length, different: outcome.different.length })}`);
  if (outcome.conflicts > 0 || outcome.missing.length > 0 || outcome.different.length > 0 || outcome.invalid.length > 0) process.exitCode = 2;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
