import { getLeads, type LeadRecord } from "@/lib/leads";
import { getRedis } from "@/lib/redis";
import { readLinkedSites, type LinkedSite, type LinkedSites } from "@/platform/owner-entry/linked-sites";
import { WorkspaceAccessError, type WorkspaceActor } from "@/platform/workspaces/types";
import type { ConnectedInquiry } from "@/products/connected-sites/contracts";

/**
 * The Inquiries page in the workspace: the home of `/dashboard/leads`
 * (owner-entry spec §5). The people who reached out through each linked site,
 * read from the same Redis-authoritative store `/dashboard/leads` reads
 * (src/lib/leads.ts). `tenant_leads` is the durable mirror; reads stay on Redis
 * until cutover, so an unconfigured or failing store is "unavailable", never
 * an empty inbox.
 *
 * Connected sites (a business's own site on any builder) send their
 * inquiries into `tenant_leads` with a connected site instead of a tenant.
 * While connected sites are on for the business they appear here too, one
 * section per connected site, read through `read_connected_site_inquiries`.
 */

export interface LeadView {
  id: string;
  name: string;
  email: string | null;
  message: string | null;
  source: string | null;
  fields: Array<[string, string]>;
  createdAt: string;
}

export interface SiteLeads {
  /** Stable section key: the tenant id, or `connected:<site id>`. */
  key: string;
  /** The tenant for a managed site; null for a connected site. */
  tenantId: string | null;
  /** A site the business connected itself; Strelva only takes its inquiries. */
  connected?: true;
  siteName: string;
  leads: LeadView[];
  /** How many reached out in the last 30 days. */
  lastThirtyDays: number;
  unavailable: boolean;
}

export interface WorkspaceLeads {
  sites: SiteLeads[];
  denied: LinkedSite[];
}

/** The retention cap, as on /dashboard/leads. */
export const LEAD_READ_LIMIT = 500;

export interface ConnectedSiteInquiries {
  siteId: string;
  siteHost: string;
  inquiries: ConnectedInquiry[];
}

export interface LeadDependencies {
  sites: (actor: WorkspaceActor, workspaceId: string) => Promise<LinkedSites>;
  storeReady: () => boolean;
  leads: (tenantId: string) => Promise<LeadRecord[]>;
  now: () => number;
  /** Null when connected sites are off for this business. Throws when they can't be read. */
  connected?: (actor: WorkspaceActor, workspaceId: string) => Promise<ConnectedSiteInquiries[] | null>;
}

/** Active connected sites with their inquiries, newest first; a revoked site stays while it has inquiries. */
export async function readConnectedSiteInquiries(actor: WorkspaceActor, workspaceId: string): Promise<ConnectedSiteInquiries[] | null> {
  const { connectedSitesReleasedFor } = await import("@/products/connected-sites/server");
  if (!(await connectedSitesReleasedFor(actor, workspaceId).catch(() => false))) return null;
  const { connectedSitesStore } = await import("@/products/connected-sites/store");
  const store = connectedSitesStore();
  const [sites, inquiries] = await Promise.all([store.list(actor, workspaceId), store.inquiries(actor, workspaceId, LEAD_READ_LIMIT)]);
  return sites
    .map((site) => ({ siteId: site.id, siteHost: site.siteHost, status: site.status, inquiries: inquiries.filter((item) => item.siteId === site.id) }))
    .filter((site) => site.status === "active" || site.inquiries.length > 0)
    .map(({ status: _status, ...site }) => site);
}

const defaults: LeadDependencies = {
  sites: (actor, workspaceId) => readLinkedSites(actor, workspaceId),
  storeReady: () => getRedis() !== null,
  leads: (tenantId) => getLeads(tenantId, LEAD_READ_LIMIT),
  now: () => Date.now(),
  connected: readConnectedSiteInquiries,
};

export function recentCount(leads: readonly LeadView[], now: number, days = 30): number {
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  return leads.filter((lead) => Date.parse(lead.createdAt) >= cutoff).length;
}

export function connectedLeadView(inquiry: ConnectedInquiry): LeadView {
  return {
    id: inquiry.id,
    name: inquiry.name.trim() || "Someone",
    email: inquiry.email?.trim() || null,
    message: inquiry.message?.trim() || null,
    source: inquiry.source?.startsWith("connected-site:site-form") ? "Your site's form" : inquiry.source ? "Strelva form" : null,
    fields: [],
    createdAt: inquiry.capturedAt,
  };
}

export function leadView(lead: LeadRecord): LeadView {
  const fields = Object.entries(lead.fields ?? {})
    .filter(([key, value]) => typeof value === "string" && value.trim() && !["name", "email", "message"].includes(key.toLowerCase()))
    .slice(0, 20);
  return {
    id: lead.id,
    name: lead.name?.trim() || "Someone",
    email: lead.email?.trim() || null,
    message: lead.message?.trim() || null,
    source: lead.source?.trim() || null,
    fields,
    createdAt: lead.createdAt,
  };
}

/** Throws WorkspaceAccessError for anyone who isn't a direct member of this business. */
export async function readWorkspaceLeads(actor: WorkspaceActor, workspaceId: string, dependencies: LeadDependencies = defaults): Promise<WorkspaceLeads> {
  const { sites, denied } = await dependencies.sites(actor, workspaceId);
  const ready = dependencies.storeReady();
  const managed: SiteLeads[] = await Promise.all(sites.map(async (site) => {
    const base = { key: site.tenantId, tenantId: site.tenantId, siteName: site.siteName };
    if (!ready) return { ...base, leads: [], lastThirtyDays: 0, unavailable: true };
    try {
      const leads = (await dependencies.leads(site.tenantId)).map(leadView).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { ...base, leads, lastThirtyDays: recentCount(leads, dependencies.now()), unavailable: false };
    } catch (error) {
      console.error("[inquiries] lead store read failed", { tenantId: site.tenantId, error: error instanceof Error ? error.message : String(error) });
      return { ...base, leads: [], lastThirtyDays: 0, unavailable: true };
    }
  }));
  return { denied, sites: [...managed, ...(await connectedSections(actor, workspaceId, dependencies))] };
}

/** Connected sites as inbox sections. A failed read is one "unavailable" section, never an empty inbox. */
async function connectedSections(actor: WorkspaceActor, workspaceId: string, dependencies: LeadDependencies): Promise<SiteLeads[]> {
  if (!dependencies.connected) return [];
  let connected: ConnectedSiteInquiries[] | null;
  try {
    connected = await dependencies.connected(actor, workspaceId);
  } catch (error) {
    if (error instanceof WorkspaceAccessError) throw error;
    console.error("[inquiries] connected-site read failed", { workspaceId, error: error instanceof Error ? error.message : String(error) });
    return [{ key: "connected", tenantId: null, connected: true, siteName: "Your connected site", leads: [], lastThirtyDays: 0, unavailable: true }];
  }
  return (connected ?? []).map((site) => {
    const leads = site.inquiries.map(connectedLeadView).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { key: `connected:${site.siteId}`, tenantId: null, connected: true as const, siteName: site.siteHost.replace(/^www\./, ""), leads, lastThirtyDays: recentCount(leads, dependencies.now()), unavailable: false };
  });
}
