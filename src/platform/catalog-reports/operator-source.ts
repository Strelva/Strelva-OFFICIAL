import { z } from "zod";
import { callReleaseFlagsRpc, workspaceReleaseFlagEnabled } from "@/platform/release-flags/store";
import type { QueueActor } from "@/platform/operator-queue/contracts";
import type { SourceRead } from "@/platform/operator-queue/project";
import { catalogReportsMayBeOn } from "./receipts";

const failuresSchema = z.array(z.object({ id: z.string().uuid(), workspaceId: z.string().uuid(), tenantId: z.string(), at: z.string(), reason: z.string().nullable() }));

export async function readCatalogReportFailures(actor: QueueActor): Promise<SourceRead[]> {
  if (!catalogReportsMayBeOn()) return [];
  const failures = await callReleaseFlagsRpc("read_catalog_report_failures", {
    p_user_id: actor.userId, p_verified_email: actor.verifiedEmail,
  }, failuresSchema, "Report failures could not be read.");
  const enabled = await Promise.all(failures.map(row => workspaceReleaseFlagEnabled("catalog_reports", row.workspaceId, { operator: true, tester: false, userId: actor.userId })));
  return [{ kind: "ops_alert", source: "Report delivery", ok: true, rows: failures.filter((_row, index) => enabled[index]).map(row => ({
    kind: "ops_alert", sourceRef: `catalog-report:${row.id}`, workspaceId: row.workspaceId, tenantId: row.tenantId,
    title: row.reason === "missing_owner_email" ? "The recap has no owner recipient" : row.reason === "owner_not_accepted" ? "The website recap needs an accepted owner" : "The recap could not be sent",
    openedAt: row.at, facts: { severity: "medium" }, href: `/admin/clients/${encodeURIComponent(row.tenantId)}#reports`,
  })) }];
}
