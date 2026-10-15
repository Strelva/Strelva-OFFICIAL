#!/usr/bin/env npx tsx
/**
 * Which businesses have no real owner email, and why. Read only: there is no
 * --apply, and nothing is sent or changed.
 *
 *   STRELVA_OPERATOR_SESSION_ACCESS_TOKEN=<signed session> npx tsx scripts/owner-reach-report.ts [--all] [--json]
 *
 * Without --all it lists the businesses whose owner cannot be told. To invite
 * an owner, use scripts/business-ownership.ts invite-owner.
 */
import { getSupabase } from "../src/platform/infra/db/client";
import { readOperatorOwnerReachReport } from "../src/platform/owner-reach/operator";
import { formatOwnerReachReport, parseOwnerReachArgs } from "./owner-reach-report-ops";
import { readOperatorSessionFromEnv } from "./operator-session";

async function main() {
  const options = parseOwnerReachArgs(process.argv.slice(2));
  if (!getSupabase()) throw new Error("No database is configured; ownership lives in Postgres.");
  const session = await readOperatorSessionFromEnv();
  const rows = await readOperatorOwnerReachReport({ userId: session.userId, verifiedEmail: session.verifiedEmail });
  if (options.json) console.log(JSON.stringify(rows, null, 2));
  else for (const line of formatOwnerReachReport(rows, { all: options.all })) console.log(line);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
