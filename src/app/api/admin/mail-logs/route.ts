import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/auth";
import { getAllTenants } from "@/lib/tenants";
import { getMailLog } from "@/lib/storage/mail-log";

/**
 * Super-admin only. Answers "why didn't tenant X get their weekly report?"
 * The weekly-report cron now records every Resend send (ok/messageId/error)
 * to reb:maillog:{tenant}; this surfaces it.
 *
 *   GET /api/admin/mail-logs                -> recent sends across all tenants
 *   GET /api/admin/mail-logs?tenant=gldf    -> that tenant's full recent log
 *   GET /api/admin/mail-logs?limit=20       -> per-tenant cap (default 10 in
 *                                              the all-tenants view, 50 scoped)
 */
export async function GET(req: Request) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const tenant = url.searchParams.get("tenant");
  const limitParam = parseInt(url.searchParams.get("limit") || "", 10);

  if (tenant) {
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 50;
    const records = await getMailLog(tenant, limit);
    return NextResponse.json({ tenant, count: records.length, records });
  }

  const perTenant = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 50) : 10;
  const tenants = await getAllTenants();
  const logs = await Promise.all(
    tenants.map(async (t) => {
      const records = await getMailLog(t.id, perTenant);
      const failed = records.filter((r) => !r.ok).length;
      return { tenant: t.id, siteName: t.siteName, count: records.length, failed, records };
    })
  );
  // Surface tenants with any mail history first, failures at the very top.
  const withHistory = logs
    .filter((l) => l.count > 0)
    .sort((a, b) => b.failed - a.failed || b.count - a.count);
  return NextResponse.json({ tenants: withHistory.length, logs: withHistory });
}
