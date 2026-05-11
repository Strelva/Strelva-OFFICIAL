import { getTemplateForTenant } from "@/components/templates/registry";
import { CUSTOM_REPO_CONTRACT_VERSION, getCustomRepoMetadata } from "@/lib/custom-repos";
import { getTenantConfig } from "@/lib/tenants";
import { siteCapabilityManifestSchema } from "@/lib/schemas";
import type {
  ContentSection,
  SectionCapability,
  SiteCapabilityManifest,
  TenantConfig,
} from "@/lib/types";

const DEFAULT_DESIGN_TOKENS = [
  "colors",
  "fonts",
  "buttons",
  "spacing",
  "radius",
  "motion",
  "imagery",
] as const;

const DEFAULT_STYLE_PROPS = ["variant", "layout.gap", "layout.padding"];

const SECTION_VARIANTS: Record<string, string[]> = {
  hero: ["default", "editorial", "image-led"],
  services: ["default", "compact", "cards"],
  products: ["default", "catalog", "featured"],
  story: ["default", "editorial"],
  testimonials: ["default", "quote-led"],
  cta: ["default", "minimal"],
  contact: ["default", "split"],
};

function sectionCapability(section: string): SectionCapability {
  return {
    variants: SECTION_VARIANTS[section] || ["default"],
    editableFields: section === "theme"
      ? ["colors", "fonts", "buttons", "spacing", "motion"]
      : ["content", "props", "variant", "layout"],
    styleProps: DEFAULT_STYLE_PROPS,
    allowedActions: ["read", "draft", "publish", "request_custom"],
  };
}

function mergeManifest(
  base: SiteCapabilityManifest,
  override: Partial<SiteCapabilityManifest> | undefined
): SiteCapabilityManifest {
  if (!override) return base;

  return {
    ...base,
    ...override,
    sections: {
      ...base.sections,
      ...override.sections,
    },
    designTokens: override.designTokens ?? base.designTokens,
    customOnlyFeatures: override.customOnlyFeatures ?? base.customOnlyFeatures,
    customRequestEndpoint: override.customRequestEndpoint ?? base.customRequestEndpoint,
    customComponents: override.customComponents ?? base.customComponents,
  };
}

export async function buildDefaultCapabilityManifest(
  tenant: string,
  tenantConfig?: TenantConfig
): Promise<SiteCapabilityManifest> {
  const template = await getTemplateForTenant(tenant);
  const customRepo = getCustomRepoMetadata(tenantConfig);
  const contentSections = new Set<string>(template.contentSections);

  for (const section of Object.keys(template.components ?? {})) {
    contentSections.add(section);
  }

  const sections = Object.fromEntries(
    Array.from(contentSections)
      .sort()
      .map((section) => [section, sectionCapability(section)])
  );

  return {
    contractVersion: customRepo.contractVersion ?? CUSTOM_REPO_CONTRACT_VERSION,
    sections,
    designTokens: [...(customRepo.supportedDesignTokens ?? DEFAULT_DESIGN_TOKENS)],
    supportsPageConfig: customRepo.supportsPageConfig ?? true,
    supportsNavigationConfig: true,
    supportsFooterConfig: true,
    supportsDraftPreview: customRepo.supportsDraftPreview ?? true,
    supportsInlineEditing: customRepo.supportsInlineEditing ?? true,
    customOnlyFeatures: customRepo.customFeatures ?? [],
    customComponents: [],
  };
}

export async function getSiteCapabilityManifest(tenant: string): Promise<SiteCapabilityManifest> {
  const tenantConfig = await getTenantConfig(tenant);
  const base = await buildDefaultCapabilityManifest(tenant, tenantConfig);
  const local = mergeManifest(base, tenantConfig?.siteCapabilities);

  const manifestUrl = tenantConfig?.customRepo?.capabilityManifestUrl;
  if (!manifestUrl) return local;

  try {
    const res = await fetch(manifestUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return local;
    const parsed = siteCapabilityManifestSchema.safeParse(await res.json());
    if (!parsed.success) return local;
    return mergeManifest(local, parsed.data);
  } catch {
    return local;
  }
}

export function manifestSupportsSection(
  manifest: SiteCapabilityManifest,
  section: string
): boolean {
  return !!manifest.sections[section];
}

export function manifestSupportsContentSection(
  manifest: SiteCapabilityManifest,
  section: ContentSection
): boolean {
  return manifestSupportsSection(manifest, section);
}

export function manifestAllowsAction(
  manifest: SiteCapabilityManifest,
  section: string,
  action: "read" | "draft" | "publish" | "request_custom"
): boolean {
  const allowed = manifest.sections[section]?.allowedActions;
  return !allowed || allowed.includes(action);
}
