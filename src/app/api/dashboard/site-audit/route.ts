/**
 * GET /api/dashboard/site-audit
 *
 * The per-account auto-audit. Runs the same free site-health engine that powers
 * the public audit tool against the signed-in tenant's live site, caches the
 * result for 24h (so opening the dashboard shows a fresh-daily health score
 * without re-scanning on every load), and returns it for the dashboard health
 * card. `?refresh=1` forces a re-scan.
 *
 * Auth-gated like the other dashboard routes (verifyAuth + requireTenantAccess).
 */

import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { verifyAuth, requireTenantAccess } from "@/lib/auth";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getTenantConfig } from "@/lib/tenants";
import { getTenantPrimaryDomain } from "@/lib/tenant-urls";
import { scanTenant } from "@/lib/scan";
import { topFixes } from "@/lib/audit/impact";
import type { TenantConfig } from "@/lib/types";
import { getRedis } from "@/lib/redis";

const CACHE_TTL_SECONDS = 60 * 60 * 24; // 24h

/** Best public URL to audit: the primary custom domain, else the stored siteUrl. */
function resolveSiteUrl(config: TenantConfig): string | null {
  const primary = getTenantPrimaryDomain(config);
  if (primary) return `https://${primary}`;
  const siteUrl = config.siteUrl?.trim();
  if (siteUrl) return /^https?:\/\//i.test(siteUrl) ? siteUrl : `https://${siteUrl}`;
  return null;
}

export async function GET(request: NextRequest) {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenant = await getTenantFromHeaders();
  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;

  const config = await getTenantConfig(tenant);
  const target = config ? resolveSiteUrl(config) : null;
  if (!target) {
    return NextResponse.json(
      { error: "No live site URL is set for this account yet." },
      { status: 404 }
    );
  }

  const refresh = request.nextUrl.searchParams.get("refresh") === "1";
  const cacheKey = `reb:site-audit:${tenant}`;
  const redis = getRedis();

  if (redis && !refresh) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return NextResponse.json(typeof cached === "string" ? JSON.parse(cached) : cached);
      }
    } catch {
      // cache miss/error — run a fresh audit
    }
  }

  try {
    // Route through scanTenant so the client view writes to the SAME scan-store
    // the admin overview + sparkline read (one source of truth), and returns the
    // full per-category detail for the card.
    const scan = await scanTenant(tenant);
    // The per-check "~$X/mo lost" / "~N customers/mo" figures come from a GENERIC
    // traffic baseline (500 visitors · 3% · $75), not this client's real numbers.
    // That's a fair cold-open hook on the public /audit tool, but invented
    // precision about a PAYING client's own site reads as fabricated — and we
    // already track their real traffic. Drop the quantified figures here; the
    // qualitative "what this costs you" impact lines (true regardless of traffic)
    // stay. Revisit by feeding real tracked traffic in, not a generic baseline.
    const detail = scan.detail.map((cat) => ({
      ...cat,
      checks: cat.checks.map((c) => {
        const clone = { ...c };
        delete clone.quantified;
        return clone;
      }),
    }));
    const result = {
      url: scan.url,
      scannedAt: scan.scannedAt,
      overallScore: scan.overallScore,
      grade: scan.grade,
      categories: detail,
      topFixes: topFixes(detail, 5),
    };

    if (redis) {
      await redis.set(cacheKey, JSON.stringify(result), { ex: CACHE_TTL_SECONDS }).catch(() => {});
    }

    return NextResponse.json(result);
  } catch (err) {
    Sentry.captureException(err, {
      tags: { feature: "site-audit" },
      extra: { tenant, target },
    });
    return NextResponse.json(
      { error: "Audit failed. Please try again." },
      { status: 500 }
    );
  }
}
