import { NextResponse } from "next/server";
import { isSuperAdmin, getActorContext } from "@/lib/auth";
import { scanAllTenants } from "@/lib/scan";
import { logAuditEvent } from "@/lib/storage";

export const maxDuration = 300;

/**
 * Scan every active tenant on demand (the same work the portfolio-scan cron does
 * on a schedule). Super-admin only. Per-tenant failures are collected, not fatal.
 *
 * Concurrency is capped at 3 here (vs the cron's 6) so a manual on-demand run
 * does not monopolise outbound fetch capacity and Supabase connections during
 * business hours. The 300-second maxDuration above provides the time budget.
 */
const SCAN_ALL_CONCURRENCY = 3;

export async function POST() {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const outcome = await scanAllTenants(SCAN_ALL_CONCURRENCY);
  const actor = await getActorContext();
  await logAuditEvent({
    tenant: "*",
    action: "scan.run_all",
    targetType: "portfolio",
    targetId: "all",
    actor,
  });
  return NextResponse.json(outcome);
}
