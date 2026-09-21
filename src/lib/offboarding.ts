import { getConnections } from "./connections";
import { listTenantDomainClaims } from "./domains";
import { getEventsRaw } from "./events";
import { getTenantConfig } from "./tenants";

export type OffboardingCheckpointState = "ready" | "pending" | "attention" | "manual";

export interface OffboardingCheckpoint {
  id: "exports" | "site_files" | "domains" | "billing" | "connections" | "workspace";
  label: string;
  state: OffboardingCheckpointState;
  detail: string;
  href?: string;
}

export interface OffboardingSnapshot {
  tenant: string;
  requestedAt: string | null;
  checkpoints: OffboardingCheckpoint[];
  connectedProviders: string[];
  domains: Array<{ domain: string; status: string; dnsStatus: string; sslStatus: string }>;
}

/**
 * Assemble the owner-visible exit state from existing authorities. This is a
 * read-only checkpoint view: it never cancels billing, removes a domain,
 * revokes access, deletes data, or invents a retention promise.
 */
export async function getOffboardingSnapshot(tenantId: string): Promise<OffboardingSnapshot> {
  const [tenant, domains, connections, pendingEvents] = await Promise.all([
    getTenantConfig(tenantId),
    listTenantDomainClaims(tenantId),
    getConnections(tenantId).catch(() => []),
    getEventsRaw(tenantId, { status: "pending", limit: 100 }),
  ]);

  const handoff = pendingEvents.find((event) => event.metadata?.kind === "offboarding_handoff_request");
  const connectedProviders = connections
    .filter((connection) => connection.status === "connected" || connection.status === "needs_reauth")
    .map((connection) => connection.provider);
  const subscriptionStatus = tenant?.subscriptionStatus ?? "none";
  const billingPending = subscriptionStatus === "active" || subscriptionStatus === "trialing" || subscriptionStatus === "past_due";

  return {
    tenant: tenantId,
    requestedAt: typeof handoff?.metadata?.requestedAt === "string" ? handoff.metadata.requestedAt : null,
    connectedProviders,
    domains: domains.map((domain) => ({
      domain: domain.domain,
      status: domain.status,
      dnsStatus: domain.dnsStatus,
      sslStatus: domain.sslStatus,
    })),
    checkpoints: [
      {
        id: "exports",
        label: "Content and assets",
        state: "ready",
        detail: "Download the existing tenant exports before changing hosting or DNS.",
        href: "/dashboard/settings#ownership",
      },
      {
        id: "site_files",
        label: "Site files",
        state: handoff ? "pending" : "manual",
        detail: handoff ? "Your site-file handoff request is in the Strelva queue." : "Request the repo and source files when transfer timing is confirmed.",
        href: "/dashboard/settings#ownership",
      },
      {
        id: "domains",
        label: "Domains and DNS",
        state: domains.length ? "attention" : "ready",
        detail: domains.length ? "Keep the current domains live until the replacement site is confirmed." : "No custom domains are currently connected.",
        href: "/dashboard/settings#domains",
      },
      {
        id: "billing",
        label: "Billing",
        state: billingPending ? "pending" : "ready",
        detail: billingPending ? "Cancel billing after the transfer and DNS timing are confirmed." : "There is no active subscription to cancel here.",
        href: "/dashboard/settings#plan",
      },
      {
        id: "connections",
        label: "Connected accounts",
        state: connectedProviders.length ? "manual" : "ready",
        detail: connectedProviders.length ? `Revoke Strelva access from ${connectedProviders.join(", ")} after the handoff.` : "No connected accounts need a revocation step.",
        href: "/dashboard/integrations",
      },
      {
        id: "workspace",
        label: "Workspace records",
        state: "manual",
        detail: "If this work used Workspace, use its existing owner-only export before leaving.",
        href: "/workspace",
      },
    ],
  };
}
