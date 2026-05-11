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

export async function fetchRebPageConfig(fallback: SitePageConfig): Promise<SitePageConfig> {
  const baseUrl = getRebBaseUrl();
  if (!baseUrl) return fallback;

  try {
    const res = await fetch(`${baseUrl}${rebRoutes.publicPageConfig(getTenantId())}`, {
      next: { revalidate: 60, tags: ["page-config"] },
    });
    if (!res.ok) return fallback;
    return await res.json() as SitePageConfig;
  } catch {
    return fallback;
  }
}
