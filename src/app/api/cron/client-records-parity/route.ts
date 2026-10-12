import { NextResponse } from "next/server";
import { requireCronRequest } from "@/lib/cron-auth";
import { recordHeartbeat } from "@/platform/infra/heartbeat";
import { alertOnce } from "@/platform/infra/monitoring";
import { getAllTenants } from "@/lib/tenants";
import { runClientRecordParitySweep } from "@/platform/client-records/parity-sweep";

export const maxDuration = 120;

/**
 * Daily read-only parity check for the client stores moving out of Redis
 * (src/platform/client-records), so the 7-day streak behind
 * STRELVA_CLIENT_RECORDS_READ runs without a manual command. It never writes
 * client rows; it records one parity row per store, tenant and day. Does
 * nothing but beat unless STRELVA_CLIENT_RECORDS_DUAL_WRITE=1 (and
 * DUAL_WRITE_PG is not 0). The backfill stays manual
 * (scripts/client-records-move.ts).
 */
export async function GET(request: Request) {
  const denied = requireCronRequest(request);
  if (denied) return denied;
  const started = Date.now();
  const result = await runClientRecordParitySweep({
    tenants: async () => (await getAllTenants()).map((tenant) => tenant.id),
    deadlineMs: 90_000,
  }).catch((error: unknown) => ({
    status: "ran" as const, stores: [], recorded: 0, outOfParity: 0, failed: 1,
    error: error instanceof Error ? error.message : String(error),
  }));
  if (result.failed > 0 || result.outOfParity > 0) {
    await alertOnce("client_records_parity", "high", {
      status: result.status,
      failed: result.failed,
      outOfParity: result.outOfParity,
      stores: result.stores.filter((s) => s.status !== "recorded" || s.outOfParity.length).map((s) => s.store).join(","),
    }, 20 * 3600);
  }
  await recordHeartbeat("client-records-parity", {
    ok: result.failed === 0,
    durationMs: Date.now() - started,
    processed: result.recorded,
    failed: result.failed,
  });
  return NextResponse.json(result);
}
