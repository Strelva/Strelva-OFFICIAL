import { getTemplateManifestForTenant } from "@/lib/template-manifests";
import { sitePageConfigSchema } from "@/lib/schemas";
import { getSiteCapabilityManifest, manifestSupportsSection } from "@/lib/site-capabilities";
import type { SitePageConfig } from "@/lib/types";

export async function parseAndValidatePageConfig(
  tenant: string,
  body: unknown
): Promise<{ pageConfig: SitePageConfig } | { error: string }> {
  const parsed = sitePageConfigSchema.safeParse(body);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message || "Invalid page config",
    };
  }

  const pageConfig = parsed.data as SitePageConfig;
  const template = await getTemplateManifestForTenant(tenant);
  const manifest = await getSiteCapabilityManifest(tenant);
  const allowedSections = new Set(Object.keys(template.components));

  if (!manifest.supportsPageConfig) {
    return {
      error: "This site does not support page-level configuration",
    };
  }

  for (const [page, config] of Object.entries(pageConfig)) {
    const seen = new Set<string>();
    for (const section of config.sections) {
      if (!allowedSections.has(section.type) || !manifestSupportsSection(manifest, section.type)) {
        return {
          error: `${section.type} is not available for this site's capability manifest`,
        };
      }
      const capability = manifest.sections[section.type]!;
      if (section.variant && !capability.variants.includes(section.variant)) {
        return {
          error: `${section.variant} is not an available variant for ${section.type}`,
        };
      }
      if (seen.has(section.type)) {
        return {
          error: `${page} includes ${section.type} more than once`,
        };
      }
      seen.add(section.type);
    }
  }

  return { pageConfig };
}
