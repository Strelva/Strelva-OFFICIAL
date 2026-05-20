/**
 * Scaffold Web client for custom repos.
 *
 * Drop this file into a per-client repo (Rohlax, GLDF, etc.) so the
 * public site can fetch content, page config, and the capability
 * manifest from Scaffold Web's /api/v1/* contract.
 *
 * Env vars:
 *   - TENANT_ID            (required)            the tenant slug
 *   - SCAFFOLD_API_URL     (preferred)           https://scaffoldweb.com
 *   - REB_API_URL          (legacy alias)        falls back when SCAFFOLD_API_URL is unset
 *
 * Legacy `REB_*` names are kept readable so existing custom repos do not
 * have to migrate env vars in lockstep with this client file. New repos
 * should set `SCAFFOLD_API_URL`.
 */

export const SCAFFOLD_CONTRACT_VERSION = "v1" as const;
/** @deprecated Use SCAFFOLD_CONTRACT_VERSION. */
export const REB_CONTRACT_VERSION = SCAFFOLD_CONTRACT_VERSION;

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

export function getScaffoldBaseUrl(): string | null {
  const url = process.env.SCAFFOLD_API_URL ?? process.env.REB_API_URL;
  return url?.replace(/\/$/, "") || null;
}

/** @deprecated Use getScaffoldBaseUrl. */
export const getRebBaseUrl = getScaffoldBaseUrl;

export const scaffoldRoutes = {
  publicContent: (tenant: string, section: string) =>
    `/api/${SCAFFOLD_CONTRACT_VERSION}/content/${tenant}/${section}`,
  publicPageConfig: (tenant: string) =>
    `/api/${SCAFFOLD_CONTRACT_VERSION}/page-config/${tenant}`,
  publicSiteCapabilities: (tenant: string) =>
    `/api/${SCAFFOLD_CONTRACT_VERSION}/site-capabilities/${tenant}`,
} as const;

/** @deprecated Use scaffoldRoutes. */
export const rebRoutes = scaffoldRoutes;

export async function fetchScaffoldContent<T>(
  section: string,
  fallback: T,
  opts: { preview?: boolean } = {}
): Promise<T> {
  const baseUrl = getScaffoldBaseUrl();
  if (!baseUrl) return fallback;

  try {
    const url = new URL(`${baseUrl}${scaffoldRoutes.publicContent(getTenantId(), section)}`);
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

/** @deprecated Use fetchScaffoldContent. */
export const fetchRebContent = fetchScaffoldContent;

export async function fetchScaffoldPageConfig(
  fallback: SitePageConfig,
  opts: { preview?: boolean } = {}
): Promise<SitePageConfig> {
  const baseUrl = getScaffoldBaseUrl();
  if (!baseUrl) return fallback;

  try {
    const url = new URL(`${baseUrl}${scaffoldRoutes.publicPageConfig(getTenantId())}`);
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

/** @deprecated Use fetchScaffoldPageConfig. */
export const fetchRebPageConfig = fetchScaffoldPageConfig;

export async function fetchScaffoldSiteCapabilities(
  fallback: SiteCapabilityManifest
): Promise<SiteCapabilityManifest> {
  const baseUrl = getScaffoldBaseUrl();
  if (!baseUrl) return fallback;

  try {
    const res = await fetch(`${baseUrl}${scaffoldRoutes.publicSiteCapabilities(getTenantId())}`, {
      next: { revalidate: 60, tags: ["site-capabilities"] },
    });
    if (!res.ok) return fallback;
    return await res.json() as SiteCapabilityManifest;
  } catch {
    return fallback;
  }
}

/** @deprecated Use fetchScaffoldSiteCapabilities. */
export const fetchRebSiteCapabilities = fetchScaffoldSiteCapabilities;
