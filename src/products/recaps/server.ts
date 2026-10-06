import { z } from "zod";
import { getMonthlyRecaps, getWeeklyBriefs } from "@/lib/weekly-brief";
import { getTenantConfig } from "@/lib/tenants";
import { getTenantSiteName } from "@/lib/tenant-display";
import type { WeeklyBrief } from "@/lib/types";
import { callReleaseFlagsRpc } from "@/platform/release-flags/store";
import type { WorkspaceActor } from "@/platform/workspaces/types";

/**
 * Recaps in the workspace (owner-entry spec §5, `/dashboard/reports`): the
 * weekly and monthly recaps Strelva already writes for each managed site,
 * read through the business's tenant link. The person needs a direct
 * membership in the business; no tenant membership is involved. Recaps stay
 * where the report crons write them; this only reads.
 */

export interface RecapView {
  id: string;
  period: "week" | "month";
  start: string;
  end: string;
  summary: string;
  highlights: string[];
  visits: number;
  visitsDelta: number;
  customerActions: number;
  nextAction: { title: string; description: string } | null;
}

export interface SiteRecaps {
  tenantId: string;
  siteName: string;
  /** Newest first. Weekly and monthly together. */
  recaps: RecapView[];
  /** The recap store couldn't be read for this site. Never shown as "no recaps". */
  unavailable: boolean;
}

const links = z.array(z.object({ tenantId: z.string().min(1), tenantStableId: z.string().uuid(), linkedAt: z.string() }));

export function recapView(brief: WeeklyBrief): RecapView {
  const stats = brief.stats;
  return {
    id: brief.id,
    period: brief.period === "month" ? "month" : "week",
    start: brief.weekStart,
    end: brief.weekEnd,
    summary: brief.summary,
    highlights: brief.highlights.slice(0, 6),
    visits: stats.pageViews,
    visitsDelta: stats.pageViewsDelta,
    customerActions: stats.bookingClicks + (stats.phoneClicks ?? 0),
    nextAction: brief.nextAction ? { title: brief.nextAction.title, description: brief.nextAction.description } : null,
  };
}

export interface RecapDependencies {
  weekly: (tenantId: string) => Promise<WeeklyBrief[]>;
  monthly: (tenantId: string) => Promise<WeeklyBrief[]>;
  siteName: (tenantId: string) => Promise<string>;
}

const defaults: RecapDependencies = {
  weekly: (tenantId) => getWeeklyBriefs(tenantId, 12),
  monthly: (tenantId) => getMonthlyRecaps(tenantId, 12),
  siteName: async (tenantId) => getTenantSiteName(tenantId, (await getTenantConfig(tenantId).catch(() => null)) ?? undefined),
};

/** Throws WorkspaceAccessError for anyone who isn't a direct member of this business. */
export async function readWorkspaceRecaps(actor: WorkspaceActor, workspaceId: string, dependencies: RecapDependencies = defaults): Promise<SiteRecaps[]> {
  const linked = await callReleaseFlagsRpc("read_workspace_tenant_links", {
    p_workspace_id: z.string().uuid().parse(workspaceId),
    p_user_id: z.string().uuid().parse(actor.userId),
    p_verified_email: z.string().email().parse(actor.verifiedEmail.trim().toLowerCase()),
  }, links, "The business's sites could not be read.");
  return Promise.all(linked.map(async ({ tenantId }) => {
    const siteName = await dependencies.siteName(tenantId).catch(() => tenantId);
    try {
      const [weekly, monthly] = await Promise.all([dependencies.weekly(tenantId), dependencies.monthly(tenantId)]);
      const recaps = [...weekly, ...monthly].map(recapView).sort((a, b) => b.end.localeCompare(a.end) || (a.period === "month" ? -1 : 1));
      return { tenantId, siteName, recaps, unavailable: false };
    } catch (error) {
      console.error("[recaps] recap store read failed", { tenantId, error: error instanceof Error ? error.message : String(error) });
      return { tenantId, siteName, recaps: [], unavailable: true };
    }
  }));
}
