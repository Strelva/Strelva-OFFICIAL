import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getRedis } from "@/lib/redis";
import { isRateLimitedWindowedAsync } from "@/lib/rate-limit";
import { runAudit } from "@/lib/audit/checks";
import { computeOverallScore, scoreToGrade } from "@/lib/audit/scoring";
import { findingsFromCategories, stripFabricatedEstimates } from "@/lib/lead-audit";
import type { AuditResult } from "@/lib/audit/types";

const MAX_SCANS_PER_DAY = 3;

async function checkRateLimit(
  ip: string
): Promise<{ allowed: boolean; remaining: number }> {
  const key = `audit-scan:${ip}`;
  const redis = getRedis();
  if (!redis) {
    return { allowed: true, remaining: MAX_SCANS_PER_DAY };
  }
  const limited = await isRateLimitedWindowedAsync(key, MAX_SCANS_PER_DAY, 86400000); // 24 hours in ms
  let remaining = MAX_SCANS_PER_DAY;
  if (!limited) {
    const count = await redis.get<number>(`reb:ratelimit:${key}`);
    const used = typeof count === "number" ? count : (typeof count === "string" ? parseInt(count, 10) : 0);
    remaining = Math.max(0, MAX_SCANS_PER_DAY - used);
  }
  return {
    allowed: !limited,
    remaining,
  };
}

export async function POST(request: NextRequest) {
  // x-forwarded-for is set by Vercel's edge network and is trustworthy in this environment.
  // If deployed elsewhere, this header could be spoofed. Use req.ip or a platform-specific method.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const { allowed, remaining } = await checkRateLimit(ip);
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limited. You can scan up to 3 sites per day." },
      { status: 429, headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  }

  let body: { url?: string; businessName?: string; location?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  const url = body.url?.trim();
  if (!url) {
    return NextResponse.json(
      { error: "URL is required." },
      { status: 400 }
    );
  }

  let normalizedUrl = url;
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  try {
    new URL(normalizedUrl);
  } catch {
    return NextResponse.json(
      { error: "Invalid URL format." },
      { status: 400 }
    );
  }

  // Check result cache before running audit
  const cacheKey = `reb:audit:${normalizedUrl}`;
  const cacheRedis = getRedis();
  if (cacheRedis) {
    try {
      const cached = await cacheRedis.get(cacheKey);
      if (cached) {
        return NextResponse.json(typeof cached === "string" ? JSON.parse(cached) : cached);
      }
    } catch {
      // Cache miss or error — proceed with fresh audit
    }
  }

  try {
    // Strip the generic-prior "~$X/mo (estimated)" figures — this anonymous route
    // (marketing quick-tools + the extensions forward here) has no measured
    // traffic, and the codebase promises the public audit never shows fabricated
    // dollar precision. The lead/CLI path already strips; match it.
    const categories = stripFabricatedEstimates(await runAudit(normalizedUrl));
    const overallScore = computeOverallScore(categories);
    const grade = scoreToGrade(overallScore);

    const result: AuditResult & { findings: ReturnType<typeof findingsFromCategories> } = {
      url: normalizedUrl,
      scannedAt: new Date().toISOString(),
      overallScore,
      grade,
      categories,
      // Additive: every non-passing check with its exact issue + fix, worst-first.
      // The public marketing "Full audit" surfaces these; legacy callers ignore it.
      findings: findingsFromCategories(categories),
    };

    // Cache successful result for 1 hour
    if (cacheRedis) {
      await cacheRedis.set(cacheKey, JSON.stringify(result), { ex: 3600 }).catch(() => {});
    }

    return NextResponse.json(result);
  } catch (err) {
    Sentry.captureException(err, {
      tags: { feature: "audit-scan" },
      extra: { url: normalizedUrl },
    });
    return NextResponse.json(
      { error: "Scan failed. Please try again." },
      { status: 500 }
    );
  }
}
