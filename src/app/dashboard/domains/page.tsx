import { getTenantFromHeaders } from "@/lib/tenant";
import { getTenantConfig } from "@/lib/tenants";
import { DomainsClient, type DomainEntry } from "./DomainsClient";

export default async function DomainsPage() {
  const tenantId = await getTenantFromHeaders();
  const config = await getTenantConfig(tenantId);
  const initialDomains: DomainEntry[] = (config?.customDomains ?? []).map((domain) => ({
    domain,
    status: "connected",
    isApex: domain.split(".").length === 2,
  }));

  return <DomainsClient initialDomains={initialDomains} />;
}
