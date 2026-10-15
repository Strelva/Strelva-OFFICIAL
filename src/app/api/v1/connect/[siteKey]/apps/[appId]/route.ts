/**
 * GET /api/v1/connect/{siteKey}/apps/{appId}
 *
 * The form a Strelva App shows on a connected site (today: Dental intake),
 * built from the live numbered Release and the business's confirmed facts.
 * Public by design: no patient data, no workspace id, wildcard CORS, never cached.
 *
 * New in the public /api/v1/* contract (additive); change only additively.
 */
import type { NextResponse } from "next/server";
import { isRateLimitedAsync, rateLimitKey } from "@/platform/infra/rate-limit";
import { connectErrorResponse, connectJson, connectPreflight, resolveConnectSite } from "@/products/connected-sites/server";
import { readPublicIntakeForm } from "@/products/vertical-intake/server";
import { verticalIntakeAppIdSchema } from "@/products/vertical-intake/contracts";

const FORMS_PER_MINUTE = 60;

export async function OPTIONS(): Promise<NextResponse> {
  return connectPreflight();
}

export async function GET(req: Request, { params }: { params: Promise<{ siteKey: string; appId: string }> }): Promise<NextResponse> {
  const { siteKey, appId } = await params;
  const parsed = verticalIntakeAppIdSchema.safeParse(appId);
  if (!parsed.success) return connectJson({ error: "Not found." }, 404);
  const resolved = await resolveConnectSite(req, siteKey, { write: false });
  if (!resolved.ok) return resolved.response;
  // Reads fail open on a limiter outage.
  let limited = false;
  try { limited = await isRateLimitedAsync(rateLimitKey(req, `v1-connect-app-form:${siteKey}`), FORMS_PER_MINUTE); } catch { limited = false; }
  if (limited) return connectJson({ error: "Too many requests. Please try again in a minute." }, 429);
  try {
    const form = await readPublicIntakeForm(siteKey, resolved.site, parsed.data, new Date());
    if (!form) return connectJson({ error: "This form isn't available right now. Please call the office." }, 404);
    return connectJson(form, 200);
  } catch (error) {
    return connectErrorResponse(error, "app-form");
  }
}
