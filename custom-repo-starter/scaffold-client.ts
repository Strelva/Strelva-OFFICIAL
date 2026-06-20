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

/**
 * Browser-safe control-plane base URL for the tracking beacon.
 *
 * The content fetchers above run on the server, so they read the server-only
 * `SCAFFOLD_API_URL`. The tracking beacon runs in the browser, where only
 * `NEXT_PUBLIC_*` env vars are inlined, so it needs its own public var.
 * `NEXT_PUBLIC_SCAFFOLD_API_URL` is preferred; the build-time value of
 * `SCAFFOLD_API_URL` is a server-side fallback for server-rendered usage.
 */
export function getPublicScaffoldBaseUrl(): string | null {
  const url =
    process.env.NEXT_PUBLIC_SCAFFOLD_API_URL ??
    process.env.SCAFFOLD_API_URL ??
    process.env.REB_API_URL;
  return url?.replace(/\/$/, "") || null;
}

/**
 * Browser-safe tenant id for the tracking beacon. Mirrors `getTenantId()` but
 * never throws — the beacon must fail silent so a missing env var can never
 * break a client site render. Reads `NEXT_PUBLIC_TENANT_ID` first (inlined in
 * the browser bundle), then the build-time `TENANT_ID`.
 */
export function getPublicTenantId(): string | null {
  return process.env.NEXT_PUBLIC_TENANT_ID ?? process.env.TENANT_ID ?? null;
}

export const scaffoldRoutes = {
  publicContent: (tenant: string, section: string) =>
    `/api/${SCAFFOLD_CONTRACT_VERSION}/content/${tenant}/${section}`,
  publicPageConfig: (tenant: string) =>
    `/api/${SCAFFOLD_CONTRACT_VERSION}/page-config/${tenant}`,
  publicSiteCapabilities: (tenant: string) =>
    `/api/${SCAFFOLD_CONTRACT_VERSION}/site-capabilities/${tenant}`,
  publicTrack: (tenant: string) =>
    `/api/${SCAFFOLD_CONTRACT_VERSION}/track/${tenant}`,
  publicCollection: (tenant: string, type: string) =>
    `/api/${SCAFFOLD_CONTRACT_VERSION}/collections/${tenant}/${type}`,
  publicCollectionEntry: (tenant: string, type: string, slug: string) =>
    `/api/${SCAFFOLD_CONTRACT_VERSION}/collections/${tenant}/${type}/${slug}`,
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

/** A published Collections CMS entry (blog post, video, product). */
export interface ScaffoldEntry<T = Record<string, unknown>> {
  slug: string;
  type: string;
  status: string;
  data: T;
  createdAt: string;
  updatedAt: string;
}

/** Fetch the published entries of a collection type (blog, video, product). */
export async function fetchScaffoldCollection<T = Record<string, unknown>>(
  type: string,
  opts: { preview?: boolean } = {}
): Promise<ScaffoldEntry<T>[]> {
  const baseUrl = getScaffoldBaseUrl();
  if (!baseUrl) return [];
  try {
    const url = new URL(`${baseUrl}${scaffoldRoutes.publicCollection(getTenantId(), type)}`);
    if (opts.preview) url.searchParams.set("preview", "true");
    const res = await fetch(url, {
      next: opts.preview ? { revalidate: 0 } : { revalidate: 60, tags: ["collections", `collection:${type}`] },
      cache: opts.preview ? "no-store" : undefined,
    });
    if (!res.ok) return [];
    const json = await res.json() as { entries?: ScaffoldEntry<T>[] };
    return json.entries ?? [];
  } catch {
    return [];
  }
}

/** Fetch one published entry of a collection type by slug. */
export async function fetchScaffoldEntry<T = Record<string, unknown>>(
  type: string,
  slug: string,
  opts: { preview?: boolean } = {}
): Promise<ScaffoldEntry<T> | null> {
  const baseUrl = getScaffoldBaseUrl();
  if (!baseUrl) return null;
  try {
    const url = new URL(`${baseUrl}${scaffoldRoutes.publicCollectionEntry(getTenantId(), type, slug)}`);
    if (opts.preview) url.searchParams.set("preview", "true");
    const res = await fetch(url, {
      next: opts.preview ? { revalidate: 0 } : { revalidate: 60, tags: ["collections", `collection:${type}:${slug}`] },
      cache: opts.preview ? "no-store" : undefined,
    });
    if (!res.ok) return null;
    return await res.json() as ScaffoldEntry<T>;
  } catch {
    return null;
  }
}

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
