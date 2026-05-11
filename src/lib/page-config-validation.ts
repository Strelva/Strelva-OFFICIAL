import { getTemplateForTenant } from "@/components/templates/registry";
import { sitePageConfigSchema } from "@/lib/schemas";
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
  const allowedSections = new Set(Object.keys(template.components));

  for (const [page, config] of Object.entries(pageConfig)) {
    const seen = new Set<string>();
    for (const section of config.sections) {
      if (!allowedSections.has(section.type)) {
        return {
          error: `${section.type} is not available for the ${template.id} template`,
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
