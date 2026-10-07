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

export const getHostedSite = cache(async () => {
  const requestHeaders = await headers();
  const tenant = requestHeaders.get("x-tenant") || getTenantFromHost(requestHeaders.get("host") || "");
  if (!tenant) return null;
  const document = await getPublishedSiteDocument(tenant);
  if (!document) return null;
  const [config, preview, capabilityTenant] = await Promise.all([getTenantConfig(tenant), isPreviewMode(), publishedCapabilityTenant(tenant, document)]);
  const businessContext = preview ? null : await readReleasedTenantBusinessContext(tenant);
  return { tenant, document, config, preview, capabilityTenant, businessContext, origin: tenantCanonicalOrigin(tenant, config) };
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
  return <SiteRenderer document={site.document} path={path} tenant={site.tenant} preview={site.preview} capabilityTenant={site.capabilityTenant} businessContext={site.businessContext} />;
}
