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
import { runAudit } from "@/lib/audit/checks";
import { computeOverallScore, scoreToGrade } from "@/lib/audit/scoring";
import { topFixes } from "@/lib/audit/impact";
import type { AuditResult } from "@/lib/audit/types";
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
    const categories = await runAudit(target);
    const overallScore = computeOverallScore(categories);
    const grade = scoreToGrade(overallScore);
    const result: AuditResult & { topFixes: ReturnType<typeof topFixes> } = {
      url: target,
      scannedAt: new Date().toISOString(),
      overallScore,
      grade,
      categories,
      topFixes: topFixes(categories, 5),
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
