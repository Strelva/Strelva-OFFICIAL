/**
 * POST /api/v1/connect/{siteKey}/events
 *
 * The connect.js beacon: visits and contact clicks, batched, application/json
 * or text/plain (sendBeacon), up to 16 KB. Deduplicated by event id. Accepted
 * only from a verified site's own Origin.
 *
 * New in the public /api/v1/* contract (additive); change only additively.
 */
import type { NextResponse } from "next/server";
import { isRateLimitedAsync, rateLimitKey } from "@/platform/infra/rate-limit";
import { recordBeacon } from "@/products/connected-sites/server";
import { connectErrorResponse, connectJson, connectPreflight, readConnectBody, resolveConnectSite } from "@/lib/connected-site-http";

const EVENTS_PER_MINUTE = 120;

export async function OPTIONS(): Promise<NextResponse> {
  return connectPreflight();
}

export async function POST(req: Request, { params }: { params: Promise<{ siteKey: string }> }): Promise<NextResponse> {
  const { siteKey } = await params;
  const resolved = await resolveConnectSite(req, siteKey, { write: true });
  if (!resolved.ok) return resolved.response;
  // Analytics fail open on a limiter outage, like the v1 track beacon.
  let limited = false;
  try { limited = await isRateLimitedAsync(rateLimitKey(req, `v1-connect-events:${siteKey}`), EVENTS_PER_MINUTE); } catch { limited = false; }
  if (limited) return connectJson({ error: "Too many requests." }, 429);
  try {
    const accepted = await recordBeacon(siteKey, resolved.site, resolved.origin, await readConnectBody(req));
    return connectJson({ accepted }, 202);
  } catch (error) {
    return connectErrorResponse(error, "events");
  }
}
