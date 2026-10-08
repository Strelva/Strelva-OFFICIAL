import { z } from "zod";
import { VersionAccessError, VersionValidationError, isRevisionQualified } from "@/platform/system-versions";
import { packageCatalogSchema, packageCreatorSchema } from "@/platform/system-versions/listing-contracts";
import { revisionQualificationSchema } from "@/platform/system-versions/declaration";
import { mapVersionsError, versionsDb, type VersionsDb } from "@/platform/system-versions/supabase-store";
import { WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { installBusinessPackage } from "./version-server";
import type { SystemRevisionRef } from "@/platform/system-versions";

function args(actor: WorkspaceActor) { return { p_user_id: actor.userId, p_verified_email: actor.verifiedEmail }; }
async function rpc(actor: WorkspaceActor, name: string, input: Record<string, unknown>, db: VersionsDb) {
  const result = await db.rpc(name, { ...args(actor), ...input });
  if (result.error) mapVersionsError(result.error, "This package request could not be confirmed.");
  return result.data;
}
export async function readPackageCatalog(actor: WorkspaceActor, workspaceId: string, db: VersionsDb = versionsDb()) {
  const listings = await rpc(actor, "read_system_package_listings", { p_workspace_id: workspaceId }, db);
  const parsed = packageCatalogSchema.safeParse({ workspaceId, listings });
  if (!parsed.success) throw new WorkspaceStoreError("The qualified package list could not be verified.");
  // Independent defence against a malformed or stale adapter response.
  if (parsed.data.listings.some(item => !isRevisionQualified(item.revision))) throw new WorkspaceStoreError("The list included a revision without exact qualification.");
  return parsed.data;
}
export async function installPackageFromListing(actor: WorkspaceActor, input: { workspaceId: string; source: SystemRevisionRef; commandId: string; name: string }, db: VersionsDb = versionsDb()) {
  const catalog = await readPackageCatalog(actor, input.workspaceId, db);
  const listing = catalog.listings.find(item => item.revision.source.revisionId === input.source.revisionId && item.revision.source.systemId === input.source.systemId && item.revision.source.businessId === input.source.businessId && item.revision.source.number === input.source.number);
  if (!listing) throw new VersionAccessError();
  if (listing.revision.definition.kind !== "internal_app") throw new VersionValidationError("This package has no automatic native install adapter yet.");
  return installBusinessPackage(actor, { ...input, context: { kind: "agency_client", label: input.name } }, db);
}
export async function readPackageCreator(actor: WorkspaceActor, workspaceId: string, systemId: string, db: VersionsDb = versionsDb()) {
  const result = await rpc(actor, "read_system_package_creator", { p_workspace_id: workspaceId, p_system_id: systemId }, db);
  const parsed = packageCreatorSchema.safeParse(result);
  if (!parsed.success) throw new WorkspaceStoreError("Creator lineage could not be verified.");
  return parsed.data;
}
export async function managePackage(actor: WorkspaceActor, workspaceId: string, input: { action: "qualify"; revisionId: string } | { action: "review"; revisionId: string; approve: boolean; note: string } | { action: "listing"; systemId: string; state: "private" | "clients" | "listed" }, db: VersionsDb = versionsDb()) {
  if (input.action === "listing") {
    const result = await rpc(actor, "set_system_package_listing", { p_workspace_id: workspaceId, p_system_id: input.systemId, p_state: input.state }, db);
    return z.object({ source: z.object({ businessId: z.literal(workspaceId), systemId: z.literal(input.systemId) }), listingState: z.literal(input.state) }).passthrough().parse(result);
  }
  const result = await rpc(actor, input.action === "qualify" ? "record_system_revision_qualification" : "review_system_revision_qualification", { p_revision_id: input.revisionId, ...(input.action === "review" ? { p_approve: input.approve, p_note: input.note } : {}) }, db);
  const parsed = revisionQualificationSchema.parse(result);
  if (parsed.revisionId !== input.revisionId) throw new WorkspaceStoreError("Qualification returned for another revision.");
  return parsed;
}
