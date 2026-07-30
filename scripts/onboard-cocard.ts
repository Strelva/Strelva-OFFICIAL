#!/usr/bin/env npx tsx
/**
 * Finish CoCard Anderson onboarding: point the tenant at its real domain and
 * repoint GSC analytics. SECRETS_ENC_KEY is Sensitive (not pullable), so we do
 * NOT go through updateTenant (which must decrypt the row). production_domain +
 * site_url are plaintext columns — write them directly via the service-role
 * client, leaving the encrypted secret columns untouched.
 *   npx tsx --env-file=.env.prod scripts/onboard-cocard.ts --apply
 */
import { getSupabase } from "../src/lib/db/client";
import { setAnalyticsConfig, getAnalyticsConfig, deriveScDomain } from "../src/lib/analytics";
import { getRedis } from "../src/lib/redis";

const ID = "cocard-anderson";
const DOMAIN = "cocardanderson.com";
const SITE_URL = "https://cocardanderson.com";
const apply = process.argv.includes("--apply");

async function main() {
  const db = getSupabase();
  if (!db) throw new Error("no supabase");

  const { data: before } = await db.from("tenants").select("id, active, production_domain, site_url").eq("id", ID).single();
  console.log("BEFORE:", JSON.stringify(before));
  const ga4 = (await getAnalyticsConfig(ID).catch(() => ({ ga4PropertyId: null }))).ga4PropertyId ?? undefined;
  const gsc = deriveScDomain(SITE_URL);
  console.log(`plan: production_domain=${DOMAIN}  site_url=${SITE_URL}  GSC=${gsc}  GA4(keep)=${ga4 ?? "-"}`);
  console.log(`mode: ${apply ? "APPLY" : "dry-run"}\n`);
  if (!apply) return;

  // 1) raw-column domain write (no encryption path)
  const { error: upErr } = await db.from("tenants").update({ production_domain: DOMAIN, site_url: SITE_URL }).eq("id", ID);
  if (upErr) throw upErr;
  console.log("1) domain columns written");

  // 2) bust tenant caches so prod rebuilds config + domain map from the new row
  const r = getRedis();
  if (r) {
    for (const k of ["reb:tenants:all", `reb:tenant:${ID}`, `reb:tenant-config:${ID}`]) {
      try { await r.del(k); } catch {}
    }
    console.log("2) tenant caches busted");
  }

  // 3) repoint GSC analytics (GA4 stays)
  await setAnalyticsConfig(ID, { gscProperty: gsc, ...(ga4 ? { ga4PropertyId: ga4 } : {}) });
  console.log(`3) analytics repointed -> GSC=${gsc} GA4=${ga4 ?? "-"}`);

  const { data: after } = await db.from("tenants").select("id, production_domain, site_url").eq("id", ID).single();
  console.log("\nAFTER:", JSON.stringify(after));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
