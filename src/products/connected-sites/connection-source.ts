import { z } from "zod";
import type { ConnectionSource } from "@/platform/connections/contracts";
import { getSupabase } from "@/platform/infra/db/client";
import { systemOriginId } from "@/platform/systems/invariants";
import { WorkspaceStoreError } from "@/platform/workspaces/types";

const metadataSchema = z.object({
  id: z.string().uuid(), business_workspace_id: z.string().uuid(), label: z.string(),
  status: z.enum(["active", "revoked"]), verified_at: z.string().nullable(), created_at: z.string(),
});
export type ConnectedSiteMetadata = z.infer<typeof metadataSchema>;

/** Install keys, verification tokens and captured inquiries never enter the Connections read model. */
export async function readConnectedSiteMetadata(workspaceId: string): Promise<ConnectedSiteMetadata[]> {
  const client = getSupabase();
  if (!client) throw new WorkspaceStoreError("Website connections are unavailable.");
  const rpc = client as unknown as { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };
  const { data, error } = await rpc.rpc("read_connected_site_connection_metadata", { p_workspace_id: z.string().uuid().parse(workspaceId) });
  if (error) throw new WorkspaceStoreError("Website connections could not be read.");
  return z.array(metadataSchema).parse(data);
}

export function createConnectedSiteConnectionSource(read = readConnectedSiteMetadata): ConnectionSource {
  return {
    provider: "connected_site",
    async list({ workspaceId }) {
      return (await read(workspaceId)).filter(row => row.business_workspace_id === workspaceId).map(row => ({
        ref: `connected_site:${row.id}`, provider: "connected_site" as const, workspaceId,
        accountLabel: row.label.slice(0, 200), accountHolder: { kind: "unknown" as const }, accessThrough: { kind: "unknown" as const },
        state: row.status === "revoked" ? "disconnected" as const : row.verified_at ? "connected" as const : "stale" as const,
        unavailableReason: null, connectedAt: row.created_at,
        systemIds: [systemOriginId(workspaceId, { kind: "connected_site", ref: row.id })],
      }));
    },
  };
}

export const connectedSiteConnectionSource = createConnectedSiteConnectionSource();
