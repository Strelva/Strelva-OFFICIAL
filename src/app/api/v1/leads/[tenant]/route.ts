/**
 * Strelva v1 public lead-capture beacon.
 *
 * A Strelva-native contact/quote form on a client site POSTs submissions here so
 * the dashboard can show "who reached out" with real names instead of anonymous
 * clicks. Public + cross-origin (client sites live on their own domains); a
 * write-only beacon that never returns tenant data, so a wildcard origin is safe.
 *
 * Part of the public /api/v1/* contract — change only additively or via a v2.
 */
import { NextResponse } from "next/server";
import { getTenantConfig } from "@/lib/tenants";
import { isRateLimitedAsync, rateLimitKey } from "@/lib/rate-limit";
import { readOptionalJsonObject } from "@/lib/request-body";
import { isTenantId } from "@/lib/scaffold-contracts";
import { recordLead } from "@/lib/leads";
import { scoreLeadSpam } from "@/lib/lead-spam";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function corsJson(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

function str(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t.slice(0, max) : undefined;
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ tenant: string }> },
): Promise<NextResponse> {
  const { tenant } = await params;
  if (!isTenantId(tenant)) {
    return corsJson({ error: "Invalid tenant" }, 400);
  }

  try {
    // Tighter ceiling than the analytics beacon — a form submit is a deliberate
    // act, not a per-pageview event. Fail open on a limiter error.
    let limited = false;
    try {
      limited = await isRateLimitedAsync(rateLimitKey(req, `v1-leads:${tenant}`), 20);
    } catch {
      limited = false;
    }
    if (limited) {
      return corsJson({ error: "Too many requests" }, 429);
    }

    const body = await readOptionalJsonObject(req);
    if (!body) {
      return corsJson({ error: "Invalid request body" }, 400);
    }

    const name = str(body.name, 200);
    if (!name) {
      return corsJson({ error: "name is required" }, 400);
    }
    const emailRaw = str(body.email, 320);
    const email = emailRaw && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailRaw) ? emailRaw : undefined;
    const message = str(body.message, 5000);
    const source = str(body.source, 80);

    // Spam gate: a hidden `website`/`company` honeypot (scaffold form leaves it
    // empty) plus the content-gibberish score. Fake-success on a hit so bots
    // can't adapt; real submissions never trip it.
    const honeypot =
      (typeof body.website === "string" ? body.website.trim() : "") ||
      (typeof body.company === "string" ? body.company.trim() : "");
    const spam = scoreLeadSpam({ businessName: name, description: message, email });
    if (honeypot || spam.isSpam) {
      console.warn("[v1 leads] dropped suspected spam", {
        tenant,
        honeypot: honeypot.length > 0,
        score: spam.score,
        signals: spam.signals,
      });
      return corsJson({ ok: true }, 200);
    }

    const config = await getTenantConfig(tenant);
    if (!config || config.active === false) {
      return corsJson({ error: "Tenant not found" }, 404);
    }

    await recordLead(tenant, { name, email, message, source });
    return corsJson({ ok: true }, 200);
  } catch (err) {
    console.error("[v1 leads POST]", tenant, err);
    return corsJson({ error: "Failed" }, 500);
  }
}
