import { AskAgencyRequiredError, type AskRequestPort } from "@/platform/ask";
import { ServiceRequestConflictError } from "@/platform/service-requests";
import { recordedActor } from "@/platform/presentation/actor";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { siteChangeRequestCommand, type SiteEditing } from "@/products/websites/client";

export interface WebsiteChangeRequestDeps {
  released(workspaceId: string): Promise<boolean>;
  /** The business's own managed site behind this System, with how it changes. Null when it is not one. */
  repoSite(actor: WorkspaceActor, workspaceId: string, systemId: string): Promise<{ tenantStableId: string; editing: SiteEditing } | null>;
  provider(actor: WorkspaceActor, workspaceId: string): Promise<{ kind: "agency"; agencyWorkspaceId: string }>;
  execute(actor: WorkspaceActor, command: ReturnType<typeof siteChangeRequestCommand>): Promise<{ id: string; context?: Record<string, unknown> }>;
}

/**
 * With sites_by_code on, an Ask for a change to a site that only changes
 * through its repo is filed as a website Request, the kind the agency's coding
 * agent can pick up. Everything else (native sites, flag off, no System) files
 * as before.
 */
export function withWebsiteChangeRequests(base: AskRequestPort, deps: WebsiteChangeRequestDeps): AskRequestPort {
  return {
    ...base,
    async file(actor, input) {
      if (!input.systemId || !(await deps.released(input.workspaceId))) return base.file(actor, input);
      const site = await deps.repoSite(actor, input.workspaceId, input.systemId);
      if (!site || site.editing !== "request") return base.file(actor, input);
      let provider: Awaited<ReturnType<typeof deps.provider>>;
      try {
        provider = await deps.provider(actor, input.workspaceId);
      } catch (error) {
        if (!(error instanceof ServiceRequestConflictError)) throw error;
        throw new AskAgencyRequiredError(error.message.includes("No active agency") ? { kind: "none" } : { kind: "several", names: [] });
      }
      const agency = await base.agency(actor, input.workspaceId).catch(() => null);
      const saved = await deps.execute(actor, siteChangeRequestCommand({
        provider, workspaceId: input.workspaceId, systemId: input.systemId, tenantStableId: site.tenantStableId, editing: "request",
        words: input.words, outcome: input.outcome, origin: "ask_strelva", idempotencyKey: input.idempotencyKey,
      }));
      const captured = recordedActor(saved.context?.actor);
      return { id: saved.id, status: "requested", agencyName: agency?.kind === "one" ? agency.name : "", ...(captured ? { actor: captured } : {}) };
    },
  };
}
