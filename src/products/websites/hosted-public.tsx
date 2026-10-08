import { readReleasedTenantBusinessContext } from "@/platform/business-record/public-reader";
import { siteWithBusinessRecord } from "./business-record";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { getTenantFromHost, isPreviewMode } from "@/lib/tenant";
import { getTenantConfig } from "@/lib/tenants";
import { getPublishedSiteDocument, publishedCapabilityTenant } from "./document-store";
import { SiteRenderer } from "./SiteRenderer";
import { hostedRedirectTarget } from "./site-routing";
import { siteDocumentMetadata, tenantCanonicalOrigin } from "./site-seo";
import { readHostedBusinessFacts } from "./business-facts-server";
import { isSitesPathHost } from "@/platform/infra/brand";
import { websiteDocumentStore } from "./document-store";
import { websiteRebuildReleaseEnabledForTenant } from "./rebuild-release";

export const getHostedSite = cache(async () => {
  const requestHeaders = await headers();
  const tenant = requestHeaders.get("x-tenant") || getTenantFromHost(requestHeaders.get("host") || "");
  if (!tenant) return null;
  const document = await getPublishedSiteDocument(tenant);
  if (!document) return null;
  const [config, preview, capabilityTenant] = await Promise.all([getTenantConfig(tenant), isPreviewMode(), publishedCapabilityTenant(tenant, document)]);
  const businessFacts = document.businessRecord && !preview ? await readHostedBusinessFacts(tenant) : null;
  const businessContext = preview || document.businessRecord ? null : await readReleasedTenantBusinessContext(tenant);
  return { tenant, document, config, preview, capabilityTenant, businessFacts, businessContext, origin: tenantCanonicalOrigin(tenant, config) };
});

/** The path mount has no legacy/draft fallback. Re-read durable publication
 * authority on every request, so Redis cannot keep a paused/deleted site live. */
export const getPathHostedSite = cache(async (tenant: string) => {
  const requestHeaders = await headers();
  if (!isSitesPathHost(requestHeaders.get("host") || "") || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(tenant)) return null;
  if (!(await websiteRebuildReleaseEnabledForTenant(tenant))) return null;
  const published = await websiteDocumentStore.published(tenant);
  if (!published) return null;
  const document = published.document;
  const [config, capabilityTenant] = await Promise.all([getTenantConfig(tenant), publishedCapabilityTenant(tenant, document)]);
  const businessFacts = document.businessRecord ? await readHostedBusinessFacts(tenant) : null;
  const businessContext = document.businessRecord ? null : await readReleasedTenantBusinessContext(tenant);
  return { tenant, document, config, preview: false as const, capabilityTenant, businessFacts, businessContext, origin: tenantCanonicalOrigin(tenant, config) };
});
export async function hostedPageMetadata(path: string) {
  const site = await getHostedSite();
  return site ? siteDocumentMetadata(siteWithBusinessRecord(site.document, site.businessContext), path, site.origin, site.preview) : null;
}
export async function renderHostedPage(path: string) {
  const site = await getHostedSite();
  if (!site) return null;
  const target = hostedRedirectTarget(site.document, path);
  if (target) permanentRedirect(target);
  if (!site.document.pages.some(page => page.path === path)) notFound();
  return <SiteRenderer document={site.document} path={path} tenant={site.tenant} preview={site.preview} capabilityTenant={site.capabilityTenant} businessFacts={site.businessFacts} businessContext={site.businessContext} />;
}

export async function renderPathHostedPage(tenant: string, path: string) {
  const site = await getPathHostedSite(tenant);
  if (!site) notFound();
  const basePath = `/sites/${tenant}`;
  const target = hostedRedirectTarget(site.document, path);
  if (target) permanentRedirect(`${basePath}${target}`);
  if (!site.document.pages.some(page => page.path === path)) notFound();
  return <SiteRenderer {...site} path={path} basePath={basePath} />;
}
