#!/usr/bin/env npx tsx
/**
 * Seed the Andy Anderson ACCOUNT (org layer) grouping his sites so /admin/accounts
 * shows the multi-site bundle. Idempotent — skips if an "Andy Anderson" account
 * already exists. The bundled subscription snapshot ($199 + $151 = $350) is
 * populated automatically by the billing webhook when he pays the bundle link;
 * this just creates the grouping + links the sites.
 *   npx tsx --env-file=.env.local scripts/seed-account-andy.ts          # dry-run
 *   npx tsx --env-file=.env.local scripts/seed-account-andy.ts --apply
 */
import { getAllAccounts, createAccount, linkTenantToAccount } from "../src/lib/accounts";

const apply = process.argv.includes("--apply");
const NAME = "Andy Anderson";
const SITES = ["cocard-anderson", "vermont-unlimited"];

async function main() {
  const existing = (await getAllAccounts()).find((a) => a.name.toLowerCase() === NAME.toLowerCase());
  if (existing) {
    console.log(`Account already exists: ${existing.id} (sites: ${existing.tenantIds.join(", ") || "none"})`);
    if (apply) {
      for (const s of SITES) if (!existing.tenantIds.includes(s)) await linkTenantToAccount(existing.id, s);
      console.log("Ensured sites linked.");
    }
    return;
  }
  console.log(`mode: ${apply ? "APPLY" : "dry-run"}  would create account "${NAME}" with sites: ${SITES.join(", ")}`);
  if (!apply) return;
  const acct = await createAccount({
    name: NAME,
    primaryContactName: "Andrew Anderson",
    tenantIds: SITES,
    notes: "Multi-site owner: CoCard Anderson ($199) + Vermont Unlimited ($151) = $350/mo bundle. + Space Jam Storage in pipeline.",
  });
  console.log(`Created account ${acct.id} with sites: ${acct.tenantIds.join(", ")}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
