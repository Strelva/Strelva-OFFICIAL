import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { runAudit } from "@/lib/audit/checks";
import { computeOverallScore, scoreToGrade } from "@/lib/audit/scoring";
import type { AuditResult } from "@/lib/audit/types";

// In-memory rate limiting (per IP, 3 scans per day).
// Resets naturally on cold start — acceptable for basic abuse prevention.
const rateMap = new Map<string, { count: number; resetAt: number }>();
const MAX_ENTRIES = 10_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);

  if (!entry || now > entry.resetAt) {
    // Evict expired entries if map grows too large
    if (rateMap.size >= MAX_ENTRIES) {
      for (const [key, val] of rateMap) {
        if (now > val.resetAt) rateMap.delete(key);
      }
    }
    rateMap.set(ip, { count: 1, resetAt: now + 86_400_000 });
    return false;
  }

  if (entry.count >= 3) return true;
  entry.count++;
  return false;
}

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Rate limited. You can scan up to 3 sites per day." },
      { status: 429 }
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

    return NextResponse.json(result);
  } catch (err) {
    Sentry.captureException(err, {
      tags: { feature: "audit-scan" },
      extra: { url: normalizedUrl },
    });
    const message =
      err instanceof Error ? err.message : "An unexpected error occurred.";
    return NextResponse.json(
      { error: `Scan failed: ${message}` },
      { status: 500 }
    );
  }
}
