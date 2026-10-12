import { getContent, getSectionTimestamps } from "@/lib/storage";
import { getTenantSiteName } from "@/lib/tenant-display";
import { getTemplateForTenant } from "@/components/templates/registry";
import { defaults } from "@/lib/defaults";
import { safeFetch } from "@/lib/utils";
import { buildSectionData } from "@/lib/buildSectionData";
import { getTenantConfig } from "@/lib/tenants";
import { COLLECTION_TYPES, type CollectionType } from "@/lib/cms/collection-types";
import { listEntriesForType } from "@/lib/cms/collections-service";
import { getConnection } from "@/lib/connections";
import { getGbpState } from "@/lib/gbp-management";
import { getTenantPrimaryDomain, getTenantPublicUrl, getTenantPublicUrlFromDomainMap } from "@/lib/tenant-urls";
import { getTenantDeliveryModel, getTenantEditablePreviewUrl } from "@/lib/custom-repos";
import { getLocalClientPreviewUrl } from "@/lib/preview-target";
import type { ContentSection, TenantConfig } from "@/lib/types";

/**
 * Where the editor shows and previews a tenant's site, as the dashboard
 * layout computes it. Shared with the workspace website so both frame the
 * same site the same way.
 */
export function siteFrameFor(tenant: string, tenantConfig: TenantConfig | null | undefined, request: { clientFallbackRoot: string; requestHost: string; requestProto: string }) {
  const siteUrl = tenantConfig
    ? getTenantPublicUrl(tenantConfig, getTenantPrimaryDomain(tenantConfig) ? "production" : process.env.NODE_ENV)
    : getTenantPublicUrlFromDomainMap(tenant);
  const liveSyncEnabled = Boolean(tenantConfig?.revalidateUrl && tenantConfig?.revalidationSecret);
  const requestOrigin = request.requestHost ? `${request.requestProto}://${request.requestHost}` : "";
  const localClientPreviewUrl = getLocalClientPreviewUrl({ clientFallbackRoot: request.clientFallbackRoot, requestHost: request.requestHost, requestProto: request.requestProto });
  const tenantEditablePreviewUrl = getTenantEditablePreviewUrl(tenantConfig ?? undefined, { requestOrigin, siteUrl });
  const shouldUseLocalClientPreviewUrl = Boolean(localClientPreviewUrl) && (!tenantConfig || getTenantDeliveryModel(tenantConfig) !== "custom_repo");
  return {
    siteUrl,
    previewUrl: shouldUseLocalClientPreviewUrl ? localClientPreviewUrl || "" : tenantEditablePreviewUrl,
    liveSyncEnabled,
    siteModel: tenantConfig?.template || "wellness",
    autoPublish: tenantConfig?.autoPublish !== false,
  };
}

/**
 * Server reads behind a managed website's own pages, shared by the
 * `/dashboard` pages and the workspace website (`/workspace/site`) so both
 * show the same data the same way. Callers authorize the tenant first.
 */

export async function loadSiteEditorData(tenant: string) {
  const siteModel = await getTemplateForTenant(tenant);
  const sectionEntries = await Promise.all(
    siteModel.contentSections.map(async (section) => {
      const data = await safeFetch(
        () => getContent(section as ContentSection, tenant),
        (defaults as Record<string, unknown>)[section] || {},
      );
      return [section, data] as const;
    }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sections: Record<string, any> = Object.fromEntries(sectionEntries);
  const timestamps = await safeFetch(() => getSectionTimestamps(tenant), {});
  const sectionData = buildSectionData(sections, timestamps);
  const settings = sections.settings || {};
  return {
    siteName: settings.siteName && settings.siteName !== "Your Business" ? settings.siteName as string : getTenantSiteName(tenant, undefined),
    ownerName: (settings.ownerName as string) || "there",
    sectionData,
    timestamps,
  };
}

export async function loadBrandKitSettings(tenant: string): Promise<Record<string, string>> {
  return (await getContent("settings", tenant).catch(() => ({}))) as Record<string, string>;
}

export async function loadCollectionsData(tenant: string) {
  const config = await getTenantConfig(tenant);
  const features = new Set(config?.features ?? []);
  // Show the collection types this tenant has enabled; default to blog so the
  // editor is never empty (blog is the wedge type).
  const enabled = (Object.keys(COLLECTION_TYPES) as CollectionType[]).filter((t) =>
    features.has(COLLECTION_TYPES[t].feature)
  );
  const types: CollectionType[] = enabled.length > 0 ? enabled : ["blog"];
  const initialType = types[0]!;
  const initialEntries = await listEntriesForType(tenant, initialType).catch(() => []);
  return {
    types,
    initialType,
    initialEntries: initialEntries.map((e) => ({
      slug: e.slug,
      status: e.status,
      data: e.data as Record<string, unknown>,
      updatedAt: e.updated_at,
    })),
  };
}

export async function loadGoogleBusinessData(tenant: string) {
  const connection = await getConnection(tenant, "google").catch(() => null);
  const connected = connection?.status === "connected";
  // Live listing state only when connected; the read itself degrades to null on
  // a transient API error (or before Google grants Business Profile API access).
  const state = connected ? await getGbpState(tenant).catch(() => null) : null;
  return { connected, state };
}

/** Existing store/member evidence. The caller authorizes workspace AND tenant first. */
export async function loadWebsiteStoreData(tenant: string) {
  const [{ getOrderSummary, getOrders }, { getProducts }, { tenantHasStore }] = await Promise.all([
    import("@/lib/orders"), import("@/lib/products"), import("@/lib/dashboard-surfaces"),
  ]);
  const [config, summary, orders, products] = await Promise.all([
    getTenantConfig(tenant), getOrderSummary(tenant, 30), getOrders(tenant, 20), getProducts(tenant),
  ]);
  return { configured: tenantHasStore({ tenantConfig: { features: config?.features }, hasCommerce: products.length > 0 }), summary, orders, products };
}

export async function loadWebsiteMembersData(tenant: string) {
  const config = await getTenantConfig(tenant);
  if (!config?.features?.includes("members")) return { configured: false as const };
  const [{ listMembers }, { KvNotConfiguredError }] = await Promise.all([
    import("@/lib/rewards/memberRepositoryKv"), import("@/lib/rewards/kv"),
  ]);
  try { return { configured: true as const, members: await listMembers(tenant) }; }
  catch (error) { if (error instanceof KvNotConfiguredError) return { configured: false as const }; throw error; }
}
