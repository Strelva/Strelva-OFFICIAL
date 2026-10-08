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
import { isRateLimitedAsync, rateLimitKey } from "@/platform/infra/rate-limit";
import { isTenantId } from "@/lib/scaffold-contracts";
import { getRedis } from "@/platform/infra/redis";
import { getTenantPublicOrigins } from "@/lib/tenant-urls";
import { getTenantTrackPublicKeys, TRACK_SIGNING_KEY_OVERLAP_MS } from "@/lib/tracking-signing-keys";
import { TRACK_SIGNATURE_HEADERS, verifyTrackSignature } from "@/lib/track-signature";

// The minimal public event vocabulary. Kept intentionally small: this is a
// non-sensitive beacon, not the full internal event set. Maps 1:1 onto the
// base event names `trackClick` already stores and `reports.ts` already reads.
// `phone-click` is a tel: tap — the #1 local conversion — and stores through the
// same base-counter path as page-view/booking-click (no serviceId, no order).
const ALLOWED_EVENTS = new Set(["page-view", "booking-click", "phone-click", "order"]);

const MAX_ORDER_CENTS = 100_000_000; // $1M — reject absurd/garbage amounts
const MAX_ITEMS = 100;
const MAX_TRACK_BODY_BYTES = 64 * 1024;
const TRACK_SITE_PER_MINUTE = 6_000;
const TRACK_IP_PER_MINUTE = 120;

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
  "Access-Control-Allow-Headers": `Content-Type, ${TRACK_SIGNATURE_HEADERS.timestamp}, ${TRACK_SIGNATURE_HEADERS.signature}, ${TRACK_SIGNATURE_HEADERS.origin}`,
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
    // Read once so the signed server-to-server order event is checked against
    // the exact bytes that were parsed. text/plain sendBeacon stays supported.
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_TRACK_BODY_BYTES) {
      return corsJson({ error: "Request body too large" }, 413);
    }
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(rawBody);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return corsJson({ error: "Invalid request body" }, 400);
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return corsJson({ error: "Invalid request body" }, 400);
    }

    const { event, serviceId } = body;
    if (typeof event !== "string" || !ALLOWED_EVENTS.has(event)) {
      return corsJson({ error: "Invalid event" }, 400);
    }

    // Check the caller first so a single IP that is already over its cap does
    // not consume the site's aggregate allowance. Non-order analytics are
    // lossy and preserve the legacy fail-open behavior during Redis outages;
    // signed orders fail closed because they affect Store outcomes.
    try {
      const ipLimited = await isRateLimitedAsync(rateLimitKey(req, "v1-track:ip"), TRACK_IP_PER_MINUTE);
      if (ipLimited) {
        return corsJson({ error: "Too many requests" }, 429);
      }
      const siteLimited = await isRateLimitedAsync(`v1-track:site:${tenant}`, TRACK_SITE_PER_MINUTE);
      if (siteLimited) {
        return corsJson({ error: "Too many requests" }, 429);
      }
    } catch {
      if (event === "order") {
        return corsJson({ error: "Tracking temporarily unavailable" }, 503);
      }
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

    // Only a site-signed order from the configured public origin is an outcome.
    // Keep the old payload/200 response for compatibility, but acknowledge an
    // unsigned or untrusted order as unverified without writing it to Store.
    if (event === "order") {
      const parsed = parseOrder(body);
      if ("error" in parsed) {
        return corsJson({ error: parsed.error }, 400);
      }

      const signedOriginHeader = req.headers.get(TRACK_SIGNATURE_HEADERS.origin);
      const browserOriginHeader = req.headers.get("origin");
      const originHeader = signedOriginHeader ?? browserOriginHeader;
      const conflictingOrigins = Boolean(
        signedOriginHeader && browserOriginHeader && signedOriginHeader !== browserOriginHeader,
      );
      let origin: string | null = null;
      try {
        const parsedOrigin = originHeader ? new URL(originHeader) : null;
        if (parsedOrigin && parsedOrigin.origin === originHeader && !parsedOrigin.username && !parsedOrigin.password) {
          origin = parsedOrigin.origin;
        }
      } catch {
        // No or malformed Origin is unverified.
      }
      const configuredOrigins = new Set(getTenantPublicOrigins(config, "production"));
      const timestamp = req.headers.get(TRACK_SIGNATURE_HEADERS.timestamp);
      const signature = req.headers.get(TRACK_SIGNATURE_HEADERS.signature);
      let verified = false;
      if (timestamp && signature) {
        const keys = await getTenantTrackPublicKeys(tenant);
        const boundToConfiguredOrigin = Boolean(
          origin && !conflictingOrigins && configuredOrigins.has(origin),
        );
        if (keys && boundToConfiguredOrigin && origin) {
          const signatureInput = { tenant, origin, timestamp, signature, rawBody };
          const currentKeyVerified = verifyTrackSignature({
            ...signatureInput,
            publicKey: keys.currentPublicKey,
          });
          const previousValidUntil = keys.previousValidUntil ? Date.parse(keys.previousValidUntil) : Number.NaN;
          const now = Date.now();
          const previousKeyIsInWindow = Boolean(
            keys.previousPublicKey &&
            Number.isFinite(previousValidUntil) &&
            now < previousValidUntil &&
            previousValidUntil <= now + TRACK_SIGNING_KEY_OVERLAP_MS,
          );
          const previousKeyVerified = previousKeyIsInWindow && verifyTrackSignature({
            ...signatureInput,
            publicKey: keys.previousPublicKey!,
          });
          verified = currentKeyVerified || previousKeyVerified;
        }
      }
      if (!verified) {
        return corsJson({ ok: true, verified: false, recorded: false }, 200);
      }

      const { recordOrder } = await import("@/lib/orders");
      const order = await recordOrder(tenant, { ...parsed, verification: "site-signature" });
      return corsJson(order
        ? { ok: true, verified: true, recorded: true }
        : { ok: true, verified: true, deduped: true }, 200);
    }

    // Best-effort dedup: collapse identical rapid-fire events (double-fires,
    // sendBeacon retries) from the same client within a short window. Redis is
    // also backs the rate limits, but click analytics retain their legacy
    // fail-open behavior when Redis is unavailable.
    const redis = getRedis();
    if (redis) {
      // Extract the IP directly from x-forwarded-for to avoid splitting on ':'
      // which produces incorrect results for IPv6 addresses (e.g. '2001:db8::1'
      // split on ':' and pop() would yield '1' instead of the full address).
      const forwarded = req.headers.get("x-forwarded-for");
      const ipPart = forwarded?.split(",")[0]?.trim() || "?";
      const dedupKey = `track:dedup:${tenant}:${event}:${serviceId ?? ""}:${ipPart}`;
      try {
        const fresh = await redis.set(dedupKey, "1", { nx: true, ex: 10 });
        if (!fresh) {
          return corsJson({ ok: true, deduped: true }, 200);
        }
      } catch {
        // A duplicate or dropped click is less harmful than losing all page
        // views during a Redis outage. This path never handles order events.
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
