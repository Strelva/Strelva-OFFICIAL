#!/usr/bin/env npx tsx
/** Read one tenant's onboarding-relevant config. npx tsx --env-file=.env.local scripts/inspect-tenant.ts <id> */
import { getTenantConfig as getTenant } from "../src/lib/tenants";

async function main() {
  const id = process.argv[2] || "cocard-anderson";
  const t = await getTenant(id);
  if (!t) { console.log(`no tenant ${id}`); return; }
  const pick = {
    id: t.id, active: t.active, siteName: t.siteName,
    siteUrl: t.siteUrl, productionDomain: t.productionDomain,
    template: t.template, industry: t.industry,
    features: t.features, businessModel: (t as any).settings?.businessModel,
    plan: (t as any).plan, billingType: (t as any).billingType, planOverride: (t as any).planOverride,
    customRepo: t.customRepo ? { url: (t.customRepo as any).url, capabilityManifestUrl: (t.customRepo as any).capabilityManifestUrl } : null,
    reviewsConfig: (t as any).reviewsConfig ? { googlePlaceId: (t as any).reviewsConfig.googlePlaceId } : null,
    ownerEmail: (t as any).ownerEmail ?? (t as any).contactEmail,
  };
  console.log(JSON.stringify(pick, null, 2));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
