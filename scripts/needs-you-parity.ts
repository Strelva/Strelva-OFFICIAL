#!/usr/bin/env npx tsx
/**
 * Needs you parity replay (docs/product/specs/needs-you.md section 6, step 1).
 *
 *   npx tsx scripts/needs-you-parity.ts                 # every tenant, against a local / scrubbed copy
 *   npx tsx scripts/needs-you-parity.ts gldf --json     # one tenant, machine-readable
 *   npx tsx scripts/needs-you-parity.ts --i-have-jacobs-yes   # read production stores, Jacob's call
 *
 * Read only: it reads each tenant's recent events (Redis, with the
 * unified_events mirror behind getEvents) and its reply mode, content autonomy
 * and approval threshold, then replays them through the evaluator. It writes
 * nothing anywhere and sends nothing. It refuses to read a non-local store
 * unless --i-have-jacobs-yes is passed, because even a read of production is
 * Jacob's call. Exit 2 means a blocking mismatch: the move must not proceed.
 */
import "../src/register-workspace-ports"; // workspace ports src/lib declares (Strelva Reborn section 7)
import { getAllTenants, getTenantConfig } from "../src/lib/tenants";
import { getEvents } from "../src/lib/events";
import { getContentAutonomy } from "../src/lib/content-autonomy";
import { getReplyVoice } from "../src/lib/reviews/reply-voice";
import { replayTenantParity, type ParityReport } from "../src/platform/needs-you/parity";

function isLocal(url: string | undefined): boolean {
  if (!url) return true;
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const yes = args.includes("--i-have-jacobs-yes");
  const only = args.filter(arg => !arg.startsWith("--"));
  const stores = [process.env.UPSTASH_REDIS_REST_URL, process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL];
  if (!yes && !stores.every(isLocal)) {
    console.error("Refusing: a store is not local. Run against `pnpm scrubbed-copy` output, or pass --i-have-jacobs-yes.");
    process.exitCode = 1;
    return;
  }
  const tenants = only.length ? only : (await getAllTenants()).map(t => t.id);
  const reports: ParityReport[] = [];
  for (const tenantId of tenants) {
    const [config, events, autonomy, voice] = await Promise.all([
      getTenantConfig(tenantId).catch(() => null),
      getEvents(tenantId, { limit: 500 }),
      getContentAutonomy(tenantId).catch(() => "approve" as const),
      getReplyVoice(tenantId).catch(() => null),
    ]);
    // The streak at replay time is not the streak when each change was
    // proposed, so it is left out; earned-trust promotions are not replayed.
    reports.push(replayTenantParity({
      tenantId,
      contentAutonomy: autonomy,
      replyMode: voice?.mode ?? "off",
      autoApproveThreshold: config?.autoApproveThreshold ?? 0,
    }, events));
  }
  if (json) console.log(JSON.stringify(reports, null, 2));
  else for (const report of reports) {
    const c = report.counts;
    console.log(`${report.tenantId}: ${c.match} match, ${c.stricter} stricter, ${c.intended} intended, ${c.blocking} blocking, ${c.skipped} not changes, ${c.verifyFailedLeaked} verify-failed shown to owner before the fix`);
    for (const row of report.rows.filter(r => r.verdict === "blocking")) console.log(`  BLOCKING ${row.eventId} ${row.kind}: today ${row.observed}, evaluator ${row.evaluated} (${row.rule})`);
    for (const item of report.notMigrated) console.log(`  not migrated: ${item.setting} = ${item.today}. ${item.reason}`);
  }
  if (reports.some(report => report.blocked)) process.exitCode = 2;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
