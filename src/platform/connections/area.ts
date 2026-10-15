import { z } from "zod";
import type { ConnectionArea } from "./contracts";
import { connectionRpc, type ConnectionsDb } from "./db";

/** The persisted active agency_scope_grants are the authority, never owner-claim proposals. */
export async function agencyHoldsArea(agencyWorkspaceId: string, businessWorkspaceId: string, area: ConnectionArea, db?: ConnectionsDb): Promise<boolean> {
  try {
    return await connectionRpc("connection_agency_holds_area", {
      p_agency_workspace_id: z.string().uuid().parse(agencyWorkspaceId),
      p_workspace_id: z.string().uuid().parse(businessWorkspaceId), p_area: area,
    }, z.boolean(), db);
  } catch { return false; }
}
