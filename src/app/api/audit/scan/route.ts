import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { Redis } from "@upstash/redis";
import { getRedis } from "@/lib/redis";
import { runAudit } from "@/lib/audit/checks";
import { computeOverallScore, scoreToGrade } from "@/lib/audit/scoring";
import type { AuditResult } from "@/lib/audit/types";

const redis = Redis.fromEnv();

const MAX_SCANS_PER_DAY = 3;

async function checkRateLimit(
  ip: string
): Promise<{ allowed: boolean; remaining: number }> {
  const key = `reb:audit-ratelimit:${ip}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, 86400); // 24 hours
  }
  return {
    allowed: count <= MAX_SCANS_PER_DAY,
    remaining: Math.max(0, MAX_SCANS_PER_DAY - count),
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
    const categories = await runAudit(normalizedUrl);
    const overallScore = computeOverallScore(categories);
    const grade = scoreToGrade(overallScore);

    const result: AuditResult = {
      url: normalizedUrl,
      scannedAt: new Date().toISOString(),
      overallScore,
      grade,
      categories,
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
