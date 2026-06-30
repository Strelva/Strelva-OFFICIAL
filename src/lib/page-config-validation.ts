import { getTemplateForTenant } from "@/components/templates/registry";
import { sitePageConfigSchema } from "@/lib/schemas";
import { getSiteCapabilityManifest, manifestSupportsSection } from "@/lib/site-capabilities";
import { isBlockType, validateBlockProps } from "@/lib/blocks/registry";
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
  const template = await getTemplateForTenant(tenant);
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
      // Registered blocks are self-contained (data in props) and repeatable —
      // multiple headings/text blocks on one page. Validate + coerce their props
      // via the block registry at the save boundary, and skip the template-section
      // gates (allowed-set, manifest, variant, single-instance dedup).
      if (isBlockType(section.type)) {
        section.props = validateBlockProps(section.type, section.props);
        continue;
      }
      if (!allowedSections.has(section.type) || !manifestSupportsSection(manifest, section.type)) {
        return {
          error: `${section.type} is not available for this site's capability manifest`,
        };
      }
      const capability = manifest.sections[section.type];
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
