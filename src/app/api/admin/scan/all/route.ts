import { NextResponse } from "next/server";
import { isSuperAdmin, getActorContext } from "@/lib/auth";
import { scanAllTenants } from "@/lib/scan";
import { logAuditEvent } from "@/lib/storage";

export const maxDuration = 300;

/**
 * Scan every active tenant on demand (the same work the portfolio-scan cron does
 * on a schedule). Super-admin only. Per-tenant failures are collected, not fatal.
 */
export async function POST() {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const outcome = await scanAllTenants();
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
