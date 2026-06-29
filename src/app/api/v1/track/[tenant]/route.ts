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
import { getRedis } from "@/lib/redis";

// The minimal public event vocabulary. Kept intentionally small: this is a
// non-sensitive beacon, not the full internal event set. Maps 1:1 onto the
// base event names `trackClick` already stores and `reports.ts` already reads.
const ALLOWED_EVENTS = new Set(["page-view", "booking-click", "order"]);

const MAX_ORDER_CENTS = 100_000_000; // $1M — reject absurd/garbage amounts
const MAX_ITEMS = 100;

/** Parse + strictly validate the order payload from a public beacon. */
function parseOrder(body: Record<string, unknown>):
  | { amountCents: number; currency: string; items: { name: string; quantity: number }[]; externalId: string }
  | { error: string } {
  const amountCents = body.amountCents;
  if (typeof amountCents !== "number" || !Number.isFinite(amountCents) || amountCents < 0 || amountCents > MAX_ORDER_CENTS) {
    return { error: "Invalid amountCents" };
  }
  const currencyRaw = typeof body.currency === "string" ? body.currency.toUpperCase() : "USD";
  const currency = /^[A-Z]{3}$/.test(currencyRaw) ? currencyRaw : "USD";
  // orderId is REQUIRED — it's the idempotency key. Without it, a retried beacon
  // (sendBeacon/keepalive often double-fire) would double-count revenue, since
  // recordOrder can only dedup on a stable provider id.
  const orderId = body.orderId;
  if (typeof orderId !== "string" || orderId.length === 0 || orderId.length > 200) {
    return { error: "Missing or invalid orderId (required for order events)" };
  }
  const items: { name: string; quantity: number }[] = [];
  if (Array.isArray(body.items)) {
    for (const raw of body.items.slice(0, MAX_ITEMS)) {
      if (!raw || typeof raw !== "object") continue;
      const it = raw as Record<string, unknown>;
      const name = typeof it.name === "string" ? it.name.slice(0, 200) : null;
      const quantity = typeof it.quantity === "number" && Number.isFinite(it.quantity) ? Math.max(1, Math.min(10_000, Math.round(it.quantity))) : 1;
      if (name) items.push({ name, quantity });
    }
  }
  return { amountCents: Math.round(amountCents), currency, items, externalId: orderId };
}

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
    // per page, but this still caps scripted floods. Fail OPEN on a rate-limiter
    // error (e.g. a Redis blip) — a dropped/duplicated analytics event is far
    // cheaper than 500-storming the beacon, and the limiter throws in prod when
    // Redis is unavailable.
    let limited = false;
    try {
      limited = await isRateLimitedAsync(rateLimitKey(req, `v1-track:${tenant}`), 120);
    } catch {
      limited = false;
    }
    if (limited) {
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

    // Order beacon: a completed storefront purchase. Recorded idempotently by
    // orderId (its own dedup) and counted in the click metrics, then we return
    // — it doesn't go through the click dedup/trackClick path below.
    if (event === "order") {
      const parsed = parseOrder(body);
      if ("error" in parsed) {
        return corsJson({ error: parsed.error }, 400);
      }
      const { recordOrder } = await import("@/lib/orders");
      await recordOrder(tenant, parsed);
      return corsJson({ ok: true }, 200);
    }

    // Best-effort dedup: collapse identical rapid-fire events (double-fires,
    // sendBeacon retries) from the same client within a short window so weekly
    // numbers aren't inflated. Lossy by design (a genuine repeat inside the
    // window is dropped) and fail-open on a Redis hiccup.
    const redis = getRedis();
    if (redis) {
      const ipPart = rateLimitKey(req, "x").split(":").pop() || "?";
      const dedupKey = `track:dedup:${tenant}:${event}:${serviceId ?? ""}:${ipPart}`;
      try {
        const fresh = await redis.set(dedupKey, "1", { nx: true, ex: 10 });
        if (!fresh) {
          return corsJson({ ok: true, deduped: true }, 200);
        }
      } catch {
        // fail open — better to count than to drop on infra error
      }
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
