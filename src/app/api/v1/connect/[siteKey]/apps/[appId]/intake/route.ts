/**
 * POST /api/v1/connect/{siteKey}/apps/{appId}/intake
 *
 * A patient's answers from the form a Strelva App shows on a connected site.
 * Accepted only from a verified site's own Origin. The answers become one
 * Inquiry in the one lead store plus one submission; honeypot hits and spam
 * get the same success shape (held in the spam pit), so bots cannot tell.
 * Nothing here sends email.
 *
 * New in the public /api/v1/* contract (additive); change only additively.
 */
import { randomUUID } from "node:crypto";
import type { NextResponse } from "next/server";
import { isRateLimitedAsync, rateLimitKey } from "@/platform/infra/rate-limit";
import { connectErrorResponse, connectJson, connectPreflight, readConnectBody, resolveConnectSite } from "@/products/connected-sites/server";
import { verticalIntakeAppIdSchema } from "@/products/vertical-intake/contracts";
import { IntakeUnavailableError, submitPublicIntake } from "@/products/vertical-intake/server";

const INTAKES_PER_MINUTE = 10;

export async function OPTIONS(): Promise<NextResponse> {
  return connectPreflight();
}

export async function POST(req: Request, { params }: { params: Promise<{ siteKey: string; appId: string }> }): Promise<NextResponse> {
  const { siteKey, appId } = await params;
  const parsed = verticalIntakeAppIdSchema.safeParse(appId);
  if (!parsed.success) return connectJson({ error: "Not found." }, 404);
  const resolved = await resolveConnectSite(req, siteKey, { write: true });
  if (!resolved.ok) return resolved.response;
  // Fails closed on a limiter outage: a flood must not reach the office.
  let limited: boolean;
  try { limited = await isRateLimitedAsync(rateLimitKey(req, `v1-connect-app-intake:${siteKey}`), INTAKES_PER_MINUTE); } catch { limited = true; }
  if (limited) return connectJson({ error: "Too many requests. Please try again in a minute." }, 429);
  try {
    const outcome = await submitPublicIntake(siteKey, resolved.site, resolved.origin, parsed.data, await readConnectBody(req));
    if (outcome.status === "ignored" || outcome.status === "held_as_spam") return connectJson({ ok: true, id: randomUUID(), triage: "routine" }, 201);
    return connectJson({ ok: true, id: outcome.id, triage: outcome.triage }, outcome.status === "duplicate" ? 200 : 201);
  } catch (error) {
    if (error instanceof IntakeUnavailableError) return connectJson({ error: error.message }, 409);
    return connectErrorResponse(error, "app-intake");
  }
}
