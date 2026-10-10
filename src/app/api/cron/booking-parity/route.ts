import { NextResponse } from "next/server";
import { requireCronRequest } from "@/lib/cron-auth";
import { getSupabase } from "@/platform/infra/db/client";
import { recordHeartbeat } from "@/platform/infra/heartbeat";
import { alertOnce } from "@/platform/infra/monitoring";
import { runBookingParitySweep } from "@/server/bookings/parity-sweep";

export const maxDuration = 120;

export async function GET(request: Request) {
  const denied = requireCronRequest(request);
  if (denied) return denied;
  const started = Date.now();
  const result = await runBookingParitySweep({
    async tenants() {
      const db = getSupabase();
      if (!db) throw new Error("tenant_list_unconfigured");
      const { data, error } = await db.from("tenants").select("id");
      if (error) throw new Error("tenant_list_failed");
      return (data ?? []).map((row) => row.id);
    },
    deadlineMs: 90_000,
  });
  if (result.failed || result.outOfParity.length) await alertOnce("booking_parity", "high", {
    failed: result.failed, outOfParity: result.outOfParity.length,
  }, 20 * 3600).catch(() => undefined);
  await recordHeartbeat("booking-parity", { ok: result.failed === 0 && result.outOfParity.length === 0, durationMs: Date.now() - started, processed: result.recorded, failed: result.failed });
  return NextResponse.json(result);
}
