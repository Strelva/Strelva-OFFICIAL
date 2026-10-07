import { collectTenantMedia } from "@/lib/media-store";
import { getSupabase } from "@/platform/infra/db/client";
import { alert } from "@/platform/infra/monitoring";
import { exportWorkspaceArchive } from "@/platform/workspace-exports/repository";
import { deliverWorkspaceExportLink } from "@/platform/workspace-exports/v3-delivery";
import type { V3Rpc } from "@/platform/workspace-exports/v3";
import type { ExportRecoveryDeps } from "@/platform/workspace-exports/recovery";

export function exportRecoveryDependencies(baseUrl: string): ExportRecoveryDeps {
  const db = getSupabase() as unknown as { rpc: V3Rpc } | null;
  if (!db) throw new Error("Export storage is unavailable.");
  return {
    rpc: (name, args) => db.rpc(name, args),
    snapshot: exportWorkspaceArchive,
    assets: async tenantIds => {
      if (!process.env.BLOB_READ_WRITE_TOKEN) return { items: [], unavailable: [{ category: "assets_manifest", reason: "The media store is not configured; URLs referenced in content remain in the content export." }] };
      const rows = await Promise.all(tenantIds.map(async tenantId => ({ tenantId, ...await collectTenantMedia(tenantId) })));
      return { items: rows.flatMap(row => row.assets.map(asset => ({ tenantId: row.tenantId, ...asset }))),
        unavailable: rows.filter(row => row.degraded).map(row => ({ category: `assets_manifest:${row.tenantId}`, reason: "The media provider could not be read completely. Request this site's manifest again." })) };
    },
    deliver: input => deliverWorkspaceExportLink({ ...input, baseUrl }),
    onFailure: (buildId, reason) => { alert("workspace_export_recovery_failed", "high", { buildId, reason }); },
  };
}
