#!/usr/bin/env npx tsx
/**
 * Update tenant branding in Sanity
 * Usage: npx tsx scripts/update-tenant-branding.ts <tenant-id>
 */
import { createClient } from "@sanity/client";

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || "production";
const token = process.env.SANITY_API_TOKEN;

if (!projectId || !token) {
  console.error("Missing NEXT_PUBLIC_SANITY_PROJECT_ID or SANITY_API_TOKEN");
  process.exit(1);
}

const client = createClient({
  projectId,
  dataset,
  apiVersion: "2024-01-01",
  token,
  useCdn: false,
});

const TENANT_BRANDING: Record<string, {
  initials: string;
  tagline: string;
  bgColor: string;
  accentColor: string;
  fgColor: string;
}> = {
  gldf: {
    initials: "GL",
    tagline: "Orchard-Dried Apple Snacks",
    bgColor: "#2c2418",
    accentColor: "#5a260c",
    fgColor: "#faf8f5",
  },
};

async function updateBranding(tenantId: string) {
  const branding = TENANT_BRANDING[tenantId];

  if (!branding) {
    console.error(`No branding defined for tenant "${tenantId}"`);
    console.error(`Available: ${Object.keys(TENANT_BRANDING).join(", ")}`);
    process.exit(1);
  }

  console.log(`Updating branding for tenant: ${tenantId}`);

  // Find the tenant document
  const tenant = await client.fetch(
    `*[_type == "tenant" && id == $id][0]`,
    { id: tenantId }
  );

  if (!tenant) {
    console.error(`Tenant "${tenantId}" not found in Sanity`);
    process.exit(1);
  }

  // Update with branding
  await client
    .patch(tenant._id)
    .set({ branding })
    .commit();

  console.log(`✓ Updated branding for "${tenantId}"`);
  console.log(`  initials: ${branding.initials}`);
  console.log(`  tagline: ${branding.tagline}`);
  console.log(`  colors: bg=${branding.bgColor} accent=${branding.accentColor} fg=${branding.fgColor}`);
}

const tenantId = process.argv[2];
if (!tenantId) {
  console.error("Usage: npx tsx scripts/update-tenant-branding.ts <tenant-id>");
  console.error(`Available: ${Object.keys(TENANT_BRANDING).join(", ")}`);
  process.exit(1);
}

updateBranding(tenantId).catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
