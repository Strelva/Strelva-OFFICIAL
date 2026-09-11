import { requireTenantAccess } from "@/lib/auth";
import { getTenantConfig } from "@/lib/tenants";
import { getTenantDashboardFallbackUrl } from "@/lib/tenant-urls";
import { getWork } from "@/platform/workspaces/repository";
import { CustomerUnavailableError } from "./errors";
import type {
  HomeFinderInstallationScope,
  HomeFinderManagementReader,
} from "./home-finder-port";
import type {
  CustomerActor,
  CustomerResourceReader,
  CustomerResourceReaders,
  CustomerResourceRecord,
} from "./types";

const HOME_FINDER_SUMMARY_READ = ["readInstallationSummary"] as const;

function sourceTime(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

/**
 * Website resources retain the existing tenant authorization boundary.  The
 * customer assignment is an additional relationship grant; it never replaces
 * requireTenantAccess or turns a customer mapping into Website permission.
 */
export const readWebsiteResource: CustomerResourceReader = async ({ resource }) => {
  const tenantId = resource.resourceReference.trim();
  if (!tenantId) throw new CustomerUnavailableError();

  const denied = await requireTenantAccess(tenantId);
  if (denied) throw new CustomerUnavailableError();

  const tenant = await getTenantConfig(tenantId);
  if (!tenant || !tenant.active) throw new CustomerUnavailableError();

  return {
    availability: "available",
    observedAt: sourceTime(tenant.updatedAt, resource.updatedAt),
    label: tenant.siteName,
    href: getTenantDashboardFallbackUrl(tenant, "/dashboard/site"),
    hrefTrust: "native",
  };
};

/**
 * Saved assessments retain the workspace repository's native ownership and
 * delegation checks.  The resource projection discards the work payload.
 */
export const readAssessmentResource: CustomerResourceReader = async ({ actor, resource }) => {
  const work = await getWork(
    { userId: actor.userId, verifiedEmail: actor.verifiedEmail },
    resource.resourceReference,
  );
  if (!work) throw new CustomerUnavailableError();

  return {
    availability: "available",
    observedAt: sourceTime(work.updatedAt, resource.updatedAt),
    ...(work.title ? { label: work.title } : {}),
    href: `/workspace?view=work&workspaceId=${encodeURIComponent(work.workspaceId)}&work=${encodeURIComponent(work.id)}`,
    hrefTrust: "internal",
  };
};

/**
 * Build the fixed IDX scope only from the already-authorized mapping.  The
 * browser cannot provide an installation ID or management operation.  The
 * adapter validates the echoed installation and safe summary before this
 * projection can be returned.
 */
export function createHomeFinderResourceReader(
  adapter: HomeFinderManagementReader,
): CustomerResourceReader {
  return async ({ resource, organizationId, customerId }) => {
    const scope: HomeFinderInstallationScope = {
      installationId: resource.resourceReference,
      managementReads: HOME_FINDER_SUMMARY_READ,
    };
    const summary = await adapter.readInstallationSummary(scope);
    return {
      availability: "available",
      observedAt: summary.observedAt,
      label: summary.brokerageName,
      // The resource link stays inside the scoped management route.  The
      // route performs the installation read and can then expose the adapter's
      // validated previewHref/readiness without making this generic reader a
      // direct provider navigation shortcut.
      href: `/api/customers/${encodeURIComponent(customerId)}/resources/${encodeURIComponent(resource.id)}?organizationId=${encodeURIComponent(organizationId)}&view=summary`,
      hrefTrust: "internal",
    };
  };
}

export type CustomerResourceReaderOptions = {
  website?: CustomerResourceReader;
  assessment?: CustomerResourceReader;
  homeFinderReader?: HomeFinderManagementReader;
};

/**
 * Install the native resource readers used by the default Customers service.
 * Callers/tests may inject a typed adapter, but never a raw provider fetcher.
 */
export function createCustomerResourceReaders(
  options: CustomerResourceReaderOptions = {},
): CustomerResourceReaders {
  const homeFinderReader = options.homeFinderReader;
  return {
    website: options.website ?? readWebsiteResource,
    assessment: options.assessment ?? readAssessmentResource,
    home_finder_installation: homeFinderReader
      ? createHomeFinderResourceReader(homeFinderReader)
      : async ({ resource }) => ({
          availability: "not_configured",
          observedAt: resource.updatedAt,
        }),
  };
}

export type { CustomerActor, CustomerResourceRecord };
