import type { SiteSummaries, SiteSummary } from "./site-summary-contract";
import { getActivity, getClickCounts } from "@/lib/storage";
import { getLeadSummary, type LeadSummary } from "@/lib/leads";
import { selectStrelvaWork, translateActivityEntry } from "@/lib/activity-feed";
import type { ActivityEntry } from "@/lib/storage/activity-store";
import { readLinkedSites, type LinkedSites } from "./linked-sites";
import type { WorkspaceActor } from "@/platform/workspaces/types";

/**
 * What Home shows from each managed site, the part of `/dashboard` (Today)
 * that isn't Needs you: who found the site, who acted, who reached out, and
 * what Strelva did. Approvals come through Needs you (src/platform/needs-you),
 * which already reads each linked tenant's pending events. Read through the
 * tenant link with the same tenant check `/dashboard` uses (linked-sites.ts).
 */

export { siteSummariesSchema, siteSummarySchema, type SiteSummaries, type SiteSummary } from "./site-summary-contract";

type Counts = { total: number; thisWeek: number };

export interface SiteSummaryDependencies {
  sites: (actor: WorkspaceActor, workspaceId: string) => Promise<LinkedSites>;
  clicks: (event: "page-view" | "booking-click" | "phone-click", tenantId: string) => Promise<Counts>;
  leads: (tenantId: string) => Promise<LeadSummary>;
  activity: (tenantId: string) => Promise<ActivityEntry[]>;
}

const defaults: SiteSummaryDependencies = {
  sites: (actor, workspaceId) => readLinkedSites(actor, workspaceId),
  clicks: (event, tenantId) => getClickCounts(event, tenantId),
  leads: (tenantId) => getLeadSummary(tenantId, 30),
  activity: (tenantId) => getActivity(tenantId),
};

/** Each read fails on its own to null ("couldn't check"), never to zero. */
async function orNull<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

/** Throws WorkspaceAccessError for anyone who isn't a direct member of this business. */
export async function readSiteSummaries(actor: WorkspaceActor, workspaceId: string, dependencies: SiteSummaryDependencies = defaults): Promise<SiteSummaries> {
  const { sites, denied } = await dependencies.sites(actor, workspaceId);
  return {
    deniedSites: denied.map((site) => site.siteName),
    sites: await Promise.all(sites.map(async (site): Promise<SiteSummary> => {
      const [visits, booking, phone, leads, activity] = await Promise.all([
        orNull(() => dependencies.clicks("page-view", site.tenantId)),
        orNull(() => dependencies.clicks("booking-click", site.tenantId)),
        orNull(() => dependencies.clicks("phone-click", site.tenantId)),
        orNull(() => dependencies.leads(site.tenantId)),
        orNull(() => dependencies.activity(site.tenantId)),
      ]);
      return {
        tenantId: site.tenantId,
        siteName: site.siteName,
        visits: visits ? { total: visits.total, thisWeek: visits.thisWeek } : null,
        // A call counts as a customer action, as on Today.
        actions: booking && phone ? { total: booking.total + phone.total, thisWeek: booking.thisWeek + phone.thisWeek } : null,
        leads: leads ? {
          count: leads.count,
          recent: leads.recent.slice(0, 3).map((lead) => ({ id: lead.id, name: lead.name?.trim() || "Someone", message: lead.message?.trim()?.slice(0, 280) || null, createdAt: lead.createdAt })),
        } : null,
        activity: activity ? selectStrelvaWork(activity).flatMap((entry) => {
          const item = translateActivityEntry(entry);
          return item ? [{ id: item.id, label: item.label, detail: item.detail ?? null, time: item.time }] : [];
        }).slice(0, 5) : null,
      };
    })),
  };
}
