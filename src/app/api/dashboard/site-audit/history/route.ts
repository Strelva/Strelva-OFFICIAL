/**
 * GET /api/dashboard/site-audit/history
 *
 * Returns the signed-in tenant's recent site-health scores (newest first) so the
 * dashboard health card can render a score trend over time. This reads the SAME
 * scan-store the admin overview sparkline uses, written by the daily
 * `portfolio-scan` cron (and refreshed when the client opens their health page).
 *
 * Auth-gated like the other dashboard routes (verifyAuth + getTenantFromHeaders
 * + requireTenantAccess).
 */

import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { verifyAuth, requireTenantAccess } from "@/lib/auth";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getScanHistory } from "@/lib/scan-store";

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
    // scan-store keeps points oldest-to-newest; the card wants newest-first.
    const points = await getScanHistory(tenant);
    const history = points.slice(-DEFAULT_HISTORY_LIMIT).reverse();
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
