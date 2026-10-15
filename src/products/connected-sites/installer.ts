import { z } from "zod";
import { credentialHolderSchema, type CredentialHolder } from "@/platform/connections/contracts";
import { getSupabase } from "@/platform/infra/db/client";
import { WorkspaceAccessError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import type { ConnectedSitesRpc } from "./store";

/** Resolve current install authority in SQL; never infer agency identity from a seat role. */
export async function resolveConnectedSiteInstaller(actor: WorkspaceActor, workspaceId: string): Promise<CredentialHolder> {
  const db = getSupabase() as unknown as ConnectedSitesRpc | null;
  if (!db) throw new WorkspaceStoreError("Connected sites are unavailable.");
  const { data, error } = await db.rpc("read_connected_site_installer", {
    p_workspace_id: z.string().uuid().parse(workspaceId),
    p_user_id: z.string().uuid().parse(actor.userId),
    p_verified_email: z.string().email().parse(actor.verifiedEmail.trim().toLowerCase()),
  });
  if (error) {
    if (error.message.includes("workspace_access_denied")) throw new WorkspaceAccessError();
    throw new WorkspaceStoreError("The connected-site installer could not be confirmed.");
  }
  const holder = credentialHolderSchema.safeParse(data);
  if (!holder.success || (holder.data.kind !== "business" && holder.data.kind !== "agency")) {
    throw new WorkspaceStoreError("The connected-site installer could not be confirmed.");
  }
  if (holder.data.kind === "business" && holder.data.workspaceId !== workspaceId) throw new WorkspaceAccessError();
  return holder.data;
}
