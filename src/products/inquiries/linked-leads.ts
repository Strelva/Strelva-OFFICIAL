import { getLeads, type LeadRecord } from "@/lib/leads";
import { getRedis } from "@/lib/redis";
import { readLinkedSites, type LinkedSite, type LinkedSites } from "@/platform/owner-entry/linked-sites";
import type { WorkspaceActor } from "@/platform/workspaces/types";

/**
 * The Inquiries page in the workspace: the home of `/dashboard/leads`
 * (owner-entry spec §5). The people who reached out through each linked site,
 * read from the same Redis-authoritative store `/dashboard/leads` reads
 * (src/lib/leads.ts). `tenant_leads` is the durable mirror; reads stay on Redis
 * until cutover, so an unconfigured or failing store is "unavailable", never
 * an empty inbox.
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
  tenantId: string;
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

export interface LeadDependencies {
  sites: (actor: WorkspaceActor, workspaceId: string) => Promise<LinkedSites>;
  storeReady: () => boolean;
  leads: (tenantId: string) => Promise<LeadRecord[]>;
  now: () => number;
}

const defaults: LeadDependencies = {
  sites: (actor, workspaceId) => readLinkedSites(actor, workspaceId),
  storeReady: () => getRedis() !== null,
  leads: (tenantId) => getLeads(tenantId, LEAD_READ_LIMIT),
  now: () => Date.now(),
};

export function recentCount(leads: readonly LeadView[], now: number, days = 30): number {
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  return leads.filter((lead) => Date.parse(lead.createdAt) >= cutoff).length;
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
  return {
    denied,
    sites: await Promise.all(sites.map(async (site) => {
      if (!ready) return { tenantId: site.tenantId, siteName: site.siteName, leads: [], lastThirtyDays: 0, unavailable: true };
      try {
        const leads = (await dependencies.leads(site.tenantId)).map(leadView).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return { tenantId: site.tenantId, siteName: site.siteName, leads, lastThirtyDays: recentCount(leads, dependencies.now()), unavailable: false };
      } catch (error) {
        console.error("[inquiries] lead store read failed", { tenantId: site.tenantId, error: error instanceof Error ? error.message : String(error) });
        return { tenantId: site.tenantId, siteName: site.siteName, leads: [], lastThirtyDays: 0, unavailable: true };
      }
    })),
  };
}
