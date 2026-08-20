import { NextResponse } from "next/server";
import { isSuperAdmin, getActorContext } from "@/lib/auth";
import { scanPortfolioDomains } from "@/lib/domain-monitor";
import { saveDomainHealth } from "@/lib/domain-monitor-store";
import { logAuditEvent } from "@/lib/storage";

export const maxDuration = 300;

/**
 * On-demand portfolio domain scan — the same work the domain-monitor cron does
 * on a schedule, run from the "Rescan" button on the admin uptime board.
 * Super-admin only. Returns the fresh results so the board updates instantly.
 */
export async function POST() {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const results = await scanPortfolioDomains();
  await saveDomainHealth(results);
  const scannedAt = new Date().toISOString();
  await logAuditEvent({
    tenant: "*",
    action: "domain_monitor.scan",
    targetType: "portfolio",
    targetId: "all",
    actor: await getActorContext(),
  });
  return NextResponse.json({ scannedAt, results });
}
