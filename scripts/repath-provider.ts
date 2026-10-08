#!/usr/bin/env npx tsx
/** Reconcile access for one tenant converted before provider seats were added.
 * Preview by default; --apply writes only through the atomic local-only RPC. */
import "../src/register-workspace-ports";
import { getSupabase } from "../src/platform/infra/db/client";
import { repathConvertedTenantProvider } from "../src/platform/business-record";
import { parseConversionArgs } from "./tenant-conversion";
import { runProviderRepath } from "./provider-repath";

async function main() {
  const options = parseConversionArgs(process.argv.slice(2));
  if (options.rollback || options.separateBusiness) {
    throw new Error("repath-provider accepts route flags, --operator-email, --apply, --i-have-jacobs-yes and --json only.");
  }
  if (!getSupabase()) throw new Error("Re-routing needs a database connection; none is configured.");
  const outcome = await runProviderRepath({
    tenantId: options.slug,
    operatorEmail: options.operatorEmail,
    agencyWorkspaceId: options.agencyWorkspaceId,
    agencyStaffEmails: options.agencyStaffEmails,
    agencySelectionBasis: options.agencySelectionBasis,
    apply: options.apply,
    jacobsYes: options.jacobsYes,
    databaseUrl: process.env.SUPABASE_URL,
  }, {
    repath: repathConvertedTenantProvider,
    log: options.json ? () => undefined : (line) => console.log(line),
  });
  if (options.json) console.log(JSON.stringify(outcome, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
