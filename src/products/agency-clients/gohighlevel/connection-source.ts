import { z } from "zod";
import type { ConnectionSource } from "@/platform/connections/contracts";
import { getSupabase } from "@/platform/infra/db/client";
import { WorkspaceStoreError } from "@/platform/workspaces/types";

const rowSchema = z.object({
  id: z.string().uuid(), workspace_id: z.string().uuid(), external_account_id: z.string(),
  status: z.enum(["connected", "needs_reauth", "revoked"]), created_at: z.string(),
});
export type GhlConnectionMetadata = z.infer<typeof rowSchema>;
interface MetadataQuery extends PromiseLike<{ data: unknown; error: unknown }> {
  select(columns: string): MetadataQuery;
  eq(column: string, value: string): MetadataQuery;
}

/** Metadata only: listing Connections never decrypts or refreshes an agency token. */
export async function readGhlConnectionMetadata(workspaceId: string): Promise<GhlConnectionMetadata[]> {
  const client = getSupabase() as unknown as { from(table: string): MetadataQuery } | null;
  if (!client) throw new WorkspaceStoreError("HighLevel connections are unavailable.");
  const { data, error } = await client.from("agency_source_connections")
    .select("id,workspace_id,external_account_id,status,created_at")
    .eq("provider", "gohighlevel").eq("workspace_id", z.string().uuid().parse(workspaceId));
  if (error) throw new WorkspaceStoreError("HighLevel connections could not be read.");
  return z.array(rowSchema).parse(data);
}

export function createGhlConnectionSource(read = readGhlConnectionMetadata): ConnectionSource {
  return {
    provider: "highlevel",
    async list({ workspaceId }) {
      const rows = await read(workspaceId);
      return rows.filter(row => row.workspace_id === workspaceId).map(row => ({
        ref: `highlevel:${row.id}`, provider: "highlevel" as const, workspaceId,
        accountLabel: `HighLevel ${row.external_account_id}`.slice(0, 200),
        // The shared read model supplies recorded holders. Legacy rows remain unknown.
        accountHolder: { kind: "unknown" as const }, accessThrough: { kind: "unknown" as const },
        state: row.status === "revoked" ? "disconnected" as const : row.status === "needs_reauth" ? "stale" as const : "connected" as const,
        unavailableReason: null, connectedAt: row.created_at, systemIds: [],
      }));
    },
  };
}

export const ghlConnectionSource = createGhlConnectionSource();
