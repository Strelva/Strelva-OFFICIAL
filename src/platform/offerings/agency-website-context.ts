import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { WorkspaceAccessError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { agencyWebsiteContextSchema, type AgencyWebsiteContext } from "./agency-website-context-contracts";
const uuid = z.string().uuid();
type ContextDb = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }> };
export async function readAgencyWebsiteContext(actor: WorkspaceActor, bindingId: string, deliveryId: string | null = null, db = getSupabase() as unknown as ContextDb | null): Promise<AgencyWebsiteContext> {
  if (!db) throw new WorkspaceStoreError("Website preparation identity is unavailable.");
  const { data, error } = await db.rpc("read_agency_website_preparation_context", { p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_binding_id: uuid.parse(bindingId), p_delivery_id: deliveryId ? uuid.parse(deliveryId) : null });
  if (error) {
    if (/denied|verified_identity_required/.test(error.message ?? "")) throw new WorkspaceAccessError();
    throw new WorkspaceStoreError("Website preparation identity is unavailable.");
  }
  const context = agencyWebsiteContextSchema.parse(data);
  if (context.bindingId !== bindingId || deliveryId && context.deliveryId !== deliveryId) throw new WorkspaceStoreError("Website preparation identity belongs to another delivery.");
  return context;
}
