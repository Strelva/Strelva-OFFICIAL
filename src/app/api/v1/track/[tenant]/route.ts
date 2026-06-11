/**
 * Strelva v1 public tracking beacon.
 *
 * Custom-repo client sites (the real public websites — Rohlax, GLDF, …) POST
 * minimal, non-sensitive analytics events here so the weekly report has real
 * numbers. The internal `/api/track` route only sees the legacy control-plane
 * preview; the live client sites are separate deployed repos that reach the
 * control plane over this versioned contract.
 *
 * This endpoint writes the SAME storage shapes as `/api/track` via
 * `trackClick(event, tenant)`, so `reports.ts` needs no changes:
 *   - page view      -> trackClick("page-view", tenant)
 *   - booking click  -> trackClick("booking-click", tenant)
 *                       and, when a serviceId is present, an additional
 *                       trackClick("booking-click:<serviceId>", tenant) so
 *                       getClickCountsByPrefix("booking-click:") populates the
 *                       per-service "top services" breakdown.
 *
 * Contract stability: this is part of the public `/api/v1/*` storefront
 * contract. Change the request/response shape only ADDITIVELY (or by adding a
 * v2 sibling) — deployed client repos depend on it.
 *
 * Public + cross-origin: client sites live on their own domains, so this route
 * answers CORS preflight and echoes permissive CORS headers. It is a write-only
 * beacon — it never returns tenant data — so a wildcard origin is safe here.
 * No secrets are accepted or required from the browser.
 */
import { NextResponse } from "next/server";
import { trackClick } from "@/lib/storage";
import { getTenantConfig } from "@/lib/tenants";
import { isRateLimitedAsync, rateLimitKey } from "@/lib/rate-limit";
import { readOptionalJsonObject } from "@/lib/request-body";
import { isTenantId } from "@/lib/scaffold-contracts";

// The minimal public event vocabulary. Kept intentionally small: this is a
// non-sensitive beacon, not the full internal event set. Maps 1:1 onto the
// base event names `trackClick` already stores and `reports.ts` already reads.
const ALLOWED_EVENTS = new Set(["page-view", "booking-click"]);

// A service id is only meaningful for booking-click. Constrain it the same way
// the internal route constrains its `booking-click:<id>` suffix so a hostile
// payload can't write arbitrary keys.
const SERVICE_ID_RE = /^[a-z0-9][a-z0-9_-]{0,79}$/i;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function corsJson(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ tenant: string }> }
): Promise<NextResponse> {
  const { tenant } = await params;

  if (!isTenantId(tenant)) {
    return corsJson({ error: "Invalid tenant" }, 400);
  }

  try {
    // Per-IP + per-tenant rate limit, same helper the internal beacon uses.
    // Generous ceiling: a single visitor legitimately fires a handful of events
    // per page, but this still caps scripted floods.
    if (await isRateLimitedAsync(rateLimitKey(req, `v1-track:${tenant}`), 120)) {
      return corsJson({ error: "Too many requests" }, 429);
    }

    // readOptionalJsonObject reads raw text() (so a text/plain sendBeacon body
    // parses the same as a JSON fetch) and returns undefined for an empty body
    // or null for malformed JSON. A tracking event always needs an `event`
    // field, so treat both "no body" cases as a 400.
    const body = await readOptionalJsonObject(req);
    if (!body) {
      return corsJson({ error: "Invalid request body" }, 400);
    }

    const { event, serviceId } = body;
    if (typeof event !== "string" || !ALLOWED_EVENTS.has(event)) {
      return corsJson({ error: "Invalid event" }, 400);
    }

    let serviceKey: string | null = null;
    if (serviceId !== undefined && serviceId !== null) {
      if (typeof serviceId !== "string" || !SERVICE_ID_RE.test(serviceId)) {
        return corsJson({ error: "Invalid serviceId" }, 400);
      }
      if (event !== "booking-click") {
        return corsJson({ error: "serviceId only valid for booking-click" }, 400);
      }
      serviceKey = `booking-click:${serviceId}`;
    }

    // Validate the tenant exists and is active only AFTER cheap input checks,
    // so a malformed flood never reaches the tenant store.
    const config = await getTenantConfig(tenant);
    if (!config || config.active === false) {
      return corsJson({ error: "Tenant not found" }, 404);
    }

    // Write the same shapes /api/track writes. A per-service booking click also
    // increments the base booking-click counter so the headline number stays
    // consistent with the per-service breakdown.
    await trackClick(event, tenant);
    if (serviceKey) {
      await trackClick(serviceKey, tenant);
    }

    return corsJson({ ok: true }, 200);
  } catch (err) {
    console.error("[v1 track POST]", tenant, err);
    return corsJson({ error: "Failed" }, 500);
  }
}
