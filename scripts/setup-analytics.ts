#!/usr/bin/env npx tsx
/**
 * Set per-client analytics config so dashboards read real GSC + GA4 data.
 * GSC property derives from the client's domain; GA4 property id can't be derived
 * (pass it). Diagnostic by default — nothing is written without --apply.
 *
 *   Dry-run (show what each client would get):
 *     npx tsx --env-file=.env.local scripts/setup-analytics.ts
 *   Write GSC config for all clients:
 *     npx tsx --env-file=.env.local scripts/setup-analytics.ts --apply
 *   Also set GA4 property ids (numeric):
 *     npx tsx --env-file=.env.local scripts/setup-analytics.ts --apply --ga4=gldf:123456789,rhm-innovations:987654321
 *
 * Reads raw tenant columns (no decryption / SECRETS_ENC_KEY needed); writes only
 * the analytics:cfg Redis blob via setAnalyticsConfig.
 */
import { getSupabase } from "../src/lib/db/client";
import { setAnalyticsConfig, getAnalyticsConfig, deriveScDomain } from "../src/lib/analytics";

const SERVICE_ACCOUNT = "strelva-reporting@strelva.iam.gserviceaccount.com";
const apply = process.argv.includes("--apply");
const ga4Arg = process.argv.find((a) => a.startsWith("--ga4="))?.slice("--ga4=".length);
const ga4Map = new Map<string, string>();
if (ga4Arg) for (const pair of ga4Arg.split(",")) { const [t, id] = pair.split(":"); if (t && id) ga4Map.set(t.trim(), id.trim()); }

async function main() {
  const db = getSupabase();
  if (!db) throw new Error("no supabase client (env not loaded?)");
  const { data, error } = await db.from("tenants").select("id, active, production_domain, site_url");
  if (error) throw error;
  const tenants = (data ?? []).filter((t: { active?: boolean }) => t.active !== false) as Array<{ id: string; production_domain?: string; site_url?: string }>;

  console.log(`Active tenants: ${tenants.length}   mode: ${apply ? "APPLY (writing config)" : "dry-run (no writes)"}\n`);
  console.log("client".padEnd(22), "GSC property (derived)".padEnd(38), "GA4 property id");
  console.log("-".repeat(84));

  const noDomain: string[] = [];
  for (const t of tenants) {
    const raw = (t.production_domain || t.site_url || "").trim();
    const withProto = raw ? (raw.startsWith("http") ? raw : `https://${raw}`) : "";
    const gsc = withProto ? deriveScDomain(withProto) : null;
    if (!gsc) noDomain.push(t.id);
    const ga4New = ga4Map.get(t.id) ?? null;
    const before = await getAnalyticsConfig(t.id).catch(() => ({ ga4PropertyId: null as string | null }));
    const ga4Show = ga4New ?? before.ga4PropertyId ?? "— (send me the id)";

    if (apply) {
      await setAnalyticsConfig(t.id, { gscProperty: gsc, ...(ga4New ? { ga4PropertyId: ga4New } : {}) });
    }
    console.log(t.id.padEnd(22), String(gsc ?? "— (no real domain)").padEnd(38), ga4Show);
  }

  if (noDomain.length) {
    console.log(`\n⚠️  No real custom domain (GSC won't derive) for: ${noDomain.join(", ")} — set their site_url/production_domain first.`);
  }
  console.log(`\nYour part — in each client's Google, add this service account as a user:`);
  console.log(`   ${SERVICE_ACCOUNT}`);
  console.log(`   · Search Console → Settings → Users and permissions → Add user (Restricted), on the "GSC property" above`);
  console.log(`   · GA4 → Admin → Property access management → add (Viewer)`);
  console.log(`Then send me each client's GA4 property id and I'll run --apply --ga4=...`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
