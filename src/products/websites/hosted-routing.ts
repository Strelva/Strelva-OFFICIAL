import { APP_ROOT_DOMAIN, SITES_ROOT_DOMAIN, tenantSiteOrigin } from "@/platform/infra/brand";
import type { SiteDocument } from "./site-document-schema";
import type { WebsiteLaunchReceipt } from "./contracts";

/**
 * Current routing for a hosted website after a tenant slug rename (audit
 * 2026-10-05, P2 #8).
 *
 * A rename moves the publication and reservation rows with the tenant
 * (`on update cascade`, stable_id), so `tenantId` on a published row is the
 * current slug. Two things keep the old slug on purpose, because they are
 * issued and never rewritten: the launch receipt (`providerUrl`) and the
 * immutable document's visitor-tool binding (`capabilities.tenant`). Routing
 * reads the current slug; the receipt and the stored document stay as issued.
 */

function slugOf(providerUrl: string | undefined, rootDomain: string): string | null {
  if (!providerUrl) return null;
  try {
    const host = new URL(providerUrl).hostname.toLowerCase();
    const suffix = `.${rootDomain.toLowerCase()}`;
    return host.endsWith(suffix) ? host.slice(0, -suffix.length) : null;
  } catch {
    return null;
  }
}

/**
 * The served copy binds its visitor tools to the current slug, but only when
 * the publication's own receipt proves the stored binding named this same
 * tenant at publication (the receipt was issued for `{slug}.{root}`). Any
 * other mismatch stays disabled, exactly as before.
 */
export function bindToCurrentTenant(document: SiteDocument, currentTenantId: string, receipt: Pick<WebsiteLaunchReceipt, "providerUrl"> | undefined, rootDomain = SITES_ROOT_DOMAIN): SiteDocument {
  const bound = document.capabilities?.tenant;
  if (!bound || bound === currentTenantId) return document;
  if ((slugOf(receipt?.providerUrl, rootDomain) ?? slugOf(receipt?.providerUrl, APP_ROOT_DOMAIN)) !== bound) return document;
  return { ...document, capabilities: { ...document.capabilities!, tenant: currentTenantId } };
}

/** Where to read a published hosted site back now: its receipt URL until a
 * rename, then the current slug's address. */
export function currentHostedUrl(row: { tenantId: string; receipt?: Pick<WebsiteLaunchReceipt, "providerUrl"> }, rootDomain = SITES_ROOT_DOMAIN): string {
  const issued = slugOf(row.receipt?.providerUrl, rootDomain);
  if (issued === row.tenantId && row.receipt?.providerUrl) return row.receipt.providerUrl;
  return `${tenantSiteOrigin(row.tenantId, rootDomain)}/`;
}
