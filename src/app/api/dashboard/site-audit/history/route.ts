/**
 * GET /api/dashboard/site-audit/history
 *
 * Returns the signed-in tenant's recent audit snapshots (newest first) so the
 * dashboard health card can render a score trend over time. Snapshots are
 * written weekly by the `/api/cron/site-audit` cron.
 *
 * Auth-gated like the other dashboard routes (verifyAuth + getTenantFromHeaders
 * + requireTenantAccess).
 */

import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { verifyAuth, requireTenantAccess } from "@/lib/auth";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getAuditHistory } from "@/lib/audit/history";

const DEFAULT_HISTORY_LIMIT = 12;

export async function GET() {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenant = await getTenantFromHeaders();
  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;

  try {
    const history = await getAuditHistory(tenant, DEFAULT_HISTORY_LIMIT);
    return NextResponse.json({ history });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { feature: "site-audit-history" },
      extra: { tenant },
    });
    return NextResponse.json(
      { error: "Could not load audit history. Please try again." },
      { status: 500 }
    );
  }
}
