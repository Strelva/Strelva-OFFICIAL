/**
 * Ask and a connected site. "Change the banner on my site", asked about a
 * connected-site System, becomes a connected-site Request to the business's
 * agency (the same Request the System page files), not a generic one. Any
 * other System, and any business where keep your site is off, files exactly as
 * before. Strelva never edits the site.
 */
import { AskAgencyRequiredError, type AskRequestPort } from "@/platform/ask";
import { ServiceRequestConflictError } from "@/platform/service-requests";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { askConnectedSiteChange, connectedSiteSystemId, connectedSitesStore, keepYourSiteReleasedFor } from "@/products/connected-sites/server";
import type { SitePlatform } from "@/products/connected-sites/contracts";

export interface ConnectedSiteRequestDeps {
  released(actor: WorkspaceActor, workspaceId: string): Promise<boolean>;
  connectedSite(actor: WorkspaceActor, workspaceId: string, systemId: string): Promise<{ id: string; siteHost: string; platform: SitePlatform } | null>;
  ask: typeof askConnectedSiteChange;
}

export const liveConnectedSiteRequestDeps: ConnectedSiteRequestDeps = {
  released: (actor, workspaceId) => keepYourSiteReleasedFor(actor, workspaceId),
  async connectedSite(actor, workspaceId, systemId) {
    const sites = await connectedSitesStore().list(actor, workspaceId);
    return sites.find(site => site.status === "active" && site.verifiedAt && connectedSiteSystemId(site) === systemId) ?? null;
  },
  ask: askConnectedSiteChange,
};

export function withConnectedSiteChangeRequests(base: AskRequestPort, deps: ConnectedSiteRequestDeps = liveConnectedSiteRequestDeps): AskRequestPort {
  return {
    agency: base.agency,
    list: base.list,
    async file(actor, input) {
      if (!input.systemId || !(await deps.released(actor, input.workspaceId).catch(() => false))) return base.file(actor, input);
      const site = await deps.connectedSite(actor, input.workspaceId, input.systemId).catch(() => null);
      if (!site) return base.file(actor, input);
      const agency = await base.agency(actor, input.workspaceId).catch((): { kind: "none" } => ({ kind: "none" }));
      try {
        const filed = await deps.ask(actor, {
          workspaceId: input.workspaceId, systemId: input.systemId, words: input.words, outcome: input.outcome, origin: "ask_strelva", idempotencyKey: input.idempotencyKey,
        });
        return { id: filed.requestId, status: "requested", agencyName: agency.kind === "one" ? agency.name : "" };
      } catch (error) {
        if (error instanceof ServiceRequestConflictError) {
          if (error.message.includes("No active agency")) throw new AskAgencyRequiredError({ kind: "none" });
          if (error.message.includes("Choose one agency")) throw new AskAgencyRequiredError({ kind: "several", names: agency.kind === "several" ? agency.names : [] });
        }
        throw error;
      }
    },
  };
}
