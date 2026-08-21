#!/usr/bin/env npx tsx
/** Read one tenant's onboarding-relevant config. npx tsx --env-file=.env.local scripts/inspect-tenant.ts <id> */
import { getTenantConfig as getTenant } from "../src/lib/tenants";
import { getContent } from "../src/lib/storage";

async function main() {
  const id = process.argv[2] || "cocard-anderson";
  const t = await getTenant(id);
  if (!t) { console.log(`no tenant ${id}`); return; }
  const settings = await getContent("settings", id).catch(() => null);
  const pick = {
    id: t.id, active: t.active, siteName: t.siteName,
    siteUrl: t.siteUrl, productionDomain: t.productionDomain,
    template: t.template, industry: t.industry,
    features: t.features, businessModel: settings?.businessModel,
    subscriptionPlan: t.subscriptionPlan, billingType: t.billingType,
    planOverride: t.planOverride,
    customRepo: t.customRepo ? {
      repoUrl: t.customRepo.repoUrl,
      capabilityManifestUrl: t.customRepo.capabilityManifestUrl,
    } : null,
    reviewsConfig: t.reviewsConfig ? {
      googlePlaceId: t.reviewsConfig.googlePlaceId,
      yelpBusinessId: t.reviewsConfig.yelpBusinessId,
    } : null,
    ownerEmail: t.ownerEmail,
  };
  console.log(JSON.stringify(pick, null, 2));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
