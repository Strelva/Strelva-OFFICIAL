import { NextResponse } from "next/server";
import { recordHeartbeat } from "@/lib/heartbeat";
import { reconcileLeadMirror } from "@/lib/client-leads";
import { purgeExpiredTenantLeads } from "@/lib/lead-mirror";
import { alertOnce } from "@/lib/monitoring";
import { requireCronRequest } from "@/lib/cron-auth";
import { repairPendingClientRecords } from "@/platform/client-records/move";

export const maxDuration = 120;

/**
 * Also enforces the stated retention for lead copies of deprovisioned clients
 * (365 days, then deleted with a receipt). A purge failure never affects the
 * retry or the heartbeat; it is reported in the response.
 *
 * Hourly retry for client leads whose Postgres copy failed at capture time
 * (src/lib/lead-mirror.ts). Anything still pending after the retry pages
 * operators, at most every six hours, and shows on /admin/client-leads.
 */
export async function GET(request: Request) {
  const denied = requireCronRequest(request);
  if (denied) return denied;

  const result = await reconcileLeadMirror({ limit: 200, deadlineMs: 90_000 });
  if (result.remaining > 0 || result.missing > 0) {
    await alertOnce(
      "lead_mirror_backlog",
      "high",
      { remaining: result.remaining, missing: result.missing, failed: result.failed },
      6 * 3600,
    );
  }
  // The same hourly retry for the other client stores moving out of Redis
  // (src/platform/client-records). Empty unless their dual-write is on.
  const clientRecords = await repairPendingClientRecords({ limit: 200 }).catch((error: unknown) => ({
    checked: 0, repaired: 0, dropped: 0, remaining: 0, failed: 1,
    error: error instanceof Error ? error.message : String(error),
  }));
  if (clientRecords.remaining > 0 || clientRecords.failed > 0) {
    await alertOnce("client_records_backlog", "high", { remaining: clientRecords.remaining, failed: clientRecords.failed }, 6 * 3600);
  }
  await recordHeartbeat("lead-mirror-reconcile", {
    ok: result.failed === 0 && result.missing === 0 && clientRecords.failed === 0,
    processed: result.checked + clientRecords.checked,
    failed: result.failed + result.missing + clientRecords.failed,
  });
  const retention = await purgeExpiredTenantLeads(1000);
  return NextResponse.json({ ...result, clientRecords, retention });
}
