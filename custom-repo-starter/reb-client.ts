export const REB_CONTRACT_VERSION = "v1" as const;

export interface PageSectionConfig {
  type: string;
  visible: boolean;
  order: number;
  props?: Record<string, unknown>;
}

export interface PageConfig {
  sections: PageSectionConfig[];
  seo?: {
    title?: string;
    description?: string;
    ogImage?: string;
  };
}

export type SitePageConfig = Record<string, PageConfig>;

export type DesignTokenScope =
  | "colors"
  | "fonts"
  | "buttons"
  | "spacing"
  | "radius"
  | "motion"
  | "imagery";

export interface SectionCapability {
  variants: string[];
  editableFields: string[];
  styleProps: string[];
  allowedActions?: Array<"read" | "draft" | "publish" | "request_custom">;
}

export interface SiteCapabilityManifest {
  contractVersion: string;
  sections: Record<string, SectionCapability>;
  designTokens: DesignTokenScope[];
  supportsPageConfig: boolean;
  supportsNavigationConfig: boolean;
  supportsFooterConfig: boolean;
  supportsDraftPreview: boolean;
  supportsInlineEditing: boolean;
  customOnlyFeatures: string[];
  customComponents: Array<{
    id: string;
    label: string;
    description?: string;
    adminOnly: boolean;
    exposure?: "inline" | "custom_request";
    supportedProps?: string[];
    requestableChanges?: string[];
  }>;
  customRequestEndpoint?: string;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function getTenantId(): string {
  return requiredEnv("TENANT_ID");
}

export function getRebBaseUrl(): string | null {
  return process.env.REB_API_URL?.replace(/\/$/, "") || null;
}

export const rebRoutes = {
  publicContent: (tenant: string, section: string) =>
    `/api/${REB_CONTRACT_VERSION}/content/${tenant}/${section}`,
  publicPageConfig: (tenant: string) =>
    `/api/${REB_CONTRACT_VERSION}/page-config/${tenant}`,
  publicSiteCapabilities: (tenant: string) =>
    `/api/${REB_CONTRACT_VERSION}/site-capabilities/${tenant}`,
} as const;

export async function fetchRebContent<T>(
  section: string,
  fallback: T,
  opts: { preview?: boolean } = {}
): Promise<T> {
  const baseUrl = getRebBaseUrl();
  if (!baseUrl) return fallback;

  try {
    const url = new URL(`${baseUrl}${rebRoutes.publicContent(getTenantId(), section)}`);
    if (opts.preview) url.searchParams.set("preview", "true");
    const res = await fetch(url, {
      next: opts.preview ? { revalidate: 0 } : { revalidate: 60, tags: ["content", `content:${section}`] },
      cache: opts.preview ? "no-store" : undefined,
    });
    if (!res.ok) return fallback;
    return await res.json() as T;
  } catch {
    return fallback;
  }
}

export async function fetchRebPageConfig(
  fallback: SitePageConfig,
  opts: { preview?: boolean } = {}
): Promise<SitePageConfig> {
  const baseUrl = getRebBaseUrl();
  if (!baseUrl) return fallback;

  try {
    const url = new URL(`${baseUrl}${rebRoutes.publicPageConfig(getTenantId())}`);
    if (opts.preview) url.searchParams.set("preview", "true");
    const res = await fetch(url, {
      next: opts.preview ? { revalidate: 0 } : { revalidate: 60, tags: ["page-config"] },
      cache: opts.preview ? "no-store" : undefined,
    });
    if (!res.ok) return fallback;
    return await res.json() as SitePageConfig;
  } catch {
    return fallback;
  }
}

export async function fetchRebSiteCapabilities(
  fallback: SiteCapabilityManifest
): Promise<SiteCapabilityManifest> {
  const baseUrl = getRebBaseUrl();
  if (!baseUrl) return fallback;

  try {
    const res = await fetch(`${baseUrl}${rebRoutes.publicSiteCapabilities(getTenantId())}`, {
      next: { revalidate: 60, tags: ["site-capabilities"] },
    });
    if (!res.ok) return fallback;
    return await res.json() as SiteCapabilityManifest;
  } catch {
    return fallback;
  }
}
