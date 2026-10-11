import { z } from "zod";
import { callReleaseFlagsRpc, tenantReleaseFlagEnabled } from "@/platform/release-flags/store";
import { catalogReportsMayBeOn } from "./receipts";

export const searchConnectionSchema = z.object({
  checkedAt: z.string().datetime({ offset: true }),
  status: z.enum(["available", "unreachable"]),
  unreachableSince: z.string().datetime({ offset: true }).nullable(),
  clicks: z.number().nonnegative().nullable(), impressions: z.number().nonnegative().nullable(),
});
export type SearchConnectionEvidence = z.infer<typeof searchConnectionSchema>;

export async function recordSearchConnection(tenantId: string, status: "available" | "unreachable", counts: { clicks: number; impressions: number } | null): Promise<void> {
  if (!catalogReportsMayBeOn() || !(await tenantReleaseFlagEnabled("catalog_reports", tenantId).catch(() => false))) return;
  await callReleaseFlagsRpc("record_catalog_search_connection", {
    p_tenant_id: tenantId, p_status: status, p_clicks: counts?.clicks ?? null, p_impressions: counts?.impressions ?? null,
  }, z.boolean(), "Search Console reachability could not be recorded.");
}

/** Called only after the Systems reader established business access. */
export async function readSearchConnection(tenantId: string, workspaceId: string): Promise<SearchConnectionEvidence | null> {
  if (!catalogReportsMayBeOn() || !(await tenantReleaseFlagEnabled("catalog_reports", tenantId).catch(() => false))) return null;
  return callReleaseFlagsRpc("read_catalog_search_connection", { p_tenant_id: tenantId, p_workspace_id: workspaceId }, searchConnectionSchema.nullable(), "Search Console reachability could not be read.");
}
