/**
 * POST /api/v1/connect/{siteKey}/inquiries
 *
 * A person reaching out through a connected site: the form connect.js mounts
 * (`capture: "strelva-form"`) or the site's own form (`capture: "site-form"`,
 * only when the business turned capture on). Accepted only from a verified
 * site's own Origin. A retry with the same id returns the same inquiry.
 *
 * Inquiries go into the one lead store (tenant_leads). Honeypot hits get the
 * same success shape and are dropped; submissions scored as spam get it too
 * and are held in the spam pit for review, so bots cannot tell.
 *
 * New in the public /api/v1/* contract (additive); change only additively.
 */
import { randomUUID } from "node:crypto";
import type { NextResponse } from "next/server";
import { isRateLimitedAsync, rateLimitKey } from "@/platform/infra/rate-limit";
import {
  connectErrorResponse,
  connectJson,
  connectPreflight,
  notifyConnectedSiteInquiry,
  readConnectBody,
  resolveConnectSite,
  submitPublicInquiry,
} from "@/products/connected-sites/server";

const INQUIRIES_PER_MINUTE = 10;

export async function OPTIONS(): Promise<NextResponse> {
  return connectPreflight();
}

export async function POST(req: Request, { params }: { params: Promise<{ siteKey: string }> }): Promise<NextResponse> {
  const { siteKey } = await params;
  const resolved = await resolveConnectSite(req, siteKey, { write: true });
  if (!resolved.ok) return resolved.response;
  // Inquiries fail closed on a limiter outage: a flood must not reach the owner.
  let limited: boolean;
  try { limited = await isRateLimitedAsync(rateLimitKey(req, `v1-connect-inquiries:${siteKey}`), INQUIRIES_PER_MINUTE); } catch { limited = true; }
  if (limited) return connectJson({ error: "Too many requests. Please try again in a minute." }, 429);
  try {
    const outcome = await submitPublicInquiry(siteKey, resolved.site, resolved.origin, await readConnectBody(req), {
      notify: async ({ site, inquiry }) => { await notifyConnectedSiteInquiry({ site, inquiry }); },
    });
    if (outcome.status === "ignored" || outcome.status === "held_as_spam") return connectJson({ ok: true, id: randomUUID() }, 201);
    let bookingOffer: unknown;
    if (process.env.STRELVA_INQUIRY_BOOKING_HANDOFF === "1") {
      const { prepareInquiryBookingOffer } = await import("@/products/inquiries");
      bookingOffer = await prepareInquiryBookingOffer({ tenantId: null, inquiryId: outcome.id, workspaceId: resolved.site.workspaceId }).catch(() => null);
    }
    return connectJson({ ok: true, id: outcome.id, ...(bookingOffer ? { bookingOffer } : {}), ...(outcome.status === "duplicate" ? { duplicate: true } : {}) }, outcome.status === "duplicate" ? 200 : 201);
  } catch (error) {
    return connectErrorResponse(error, "inquiries");
  }
}
