import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { siteChangeReceiptSchema, siteChangeRequestSchema, type RecordSiteChange, type SiteChangeReceipt, type SiteChangeRequest } from "./site-change-model";
import { observeWebsiteSystemRelease } from "./system-releases";

export * from "./site-change-model";

/**
 * Repo changes to a managed website (website-system spec behavior 9, "New"
 * item 6). "Ask for a change" files a Request to Strelva (a service request
 * with `context.source = 'website_change'`); Strelva records a preview, the
 * owner approves or declines it, Strelva records the deploy with its commit,
 * deployment URL and read-back. Receipts live in
 * 20261008111000_website_change_receipts.sql and are append-only. Nothing
 * here deploys: it records what people did.
 */

export class SiteChangeOrderError extends WorkspaceConflictError {
  constructor(message: string) { super(message); this.name = "SiteChangeOrderError"; }
}

type DbError = { message?: string; code?: string } | null;
export type SiteChangesDb = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: DbError }> };

function failure(error: DbError): never {
  const detail = `${error?.code ?? ""} ${error?.message ?? ""}`;
  if (detail.includes("website_change_access_denied") || detail.includes("website_change_not_found")) throw new WorkspaceAccessError("This change request is unavailable to your account.");
  if (detail.includes("website_change_owner_required")) throw new WorkspaceAccessError("Only an owner of this business can approve or decline a preview.");
  if (detail.includes("website_change_operator_required")) throw new WorkspaceAccessError("Only Strelva records previews and deploys.");
  if (detail.includes("website_change_out_of_order")) throw new SiteChangeOrderError("That step doesn't follow from where this request is. Reload it.");
  if (detail.includes("website_change_closed")) throw new SiteChangeOrderError("This request is closed.");
  if (detail.includes("website_change_invalid")) throw new SiteChangeOrderError("Check the details. Links must start with https://.");
  throw new WorkspaceStoreError("Website change requests are unavailable.");
}

export function createSiteChangeStore(db?: SiteChangesDb) {
  const client = (): SiteChangesDb => {
    if (db) return db;
    const value = getSupabase();
    if (!value) throw new WorkspaceStoreError("Website change requests are unavailable.");
    return value as unknown as SiteChangesDb;
  };
  const identity = (actor: WorkspaceActor) => ({ p_user_id: actor.userId, p_verified_email: actor.verifiedEmail.trim().toLowerCase() });
  return {
    async list(actor: WorkspaceActor, workspaceId: string, systemId: string): Promise<SiteChangeRequest[]> {
      const { data, error } = await client().rpc("list_website_change_requests", { p_workspace_id: workspaceId, ...identity(actor), p_system_id: systemId });
      if (error) failure(error);
      const parsed = z.array(siteChangeRequestSchema).safeParse(data);
      if (!parsed.success) throw new WorkspaceStoreError("Website change requests could not be read.");
      return parsed.data;
    },
    async record(actor: WorkspaceActor, workspaceId: string, requestId: string, step: RecordSiteChange): Promise<SiteChangeReceipt> {
      const { kind, ...details } = step;
      const { data, error } = await client().rpc("record_website_change_receipt", {
        p_workspace_id: workspaceId, ...identity(actor), p_request_id: requestId, p_kind: kind, p_details: details,
      });
      if (error) failure(error);
      const parsed = siteChangeReceiptSchema.passthrough().safeParse(data);
      if (!parsed.success) throw new WorkspaceStoreError("The receipt could not be confirmed. Reload before trying again.");
      if (parsed.data.kind === "deployed" && typeof parsed.data.systemId === "string") {
        await observeWebsiteSystemRelease(actor, workspaceId, parsed.data.systemId, client());
      }
      return parsed.data;
    },
  };
}
