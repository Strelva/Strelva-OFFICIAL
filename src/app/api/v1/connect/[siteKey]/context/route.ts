/**
 * GET /api/v1/connect/{siteKey}/context
 *
 * The business's confirmed facts for connect.js to fill into the page, from
 * the business record (no second fact store), plus schema.org when the site
 * asked for it. Public by design; cached for a minute.
 *
 * New in the public /api/v1/* contract (additive); change only additively.
 */
import type { NextResponse } from "next/server";
import { connectErrorResponse, connectJson, connectPreflight, readPublicContext, resolveConnectSite } from "@/products/connected-sites/server";

export async function OPTIONS(): Promise<NextResponse> {
  return connectPreflight();
}

export async function GET(req: Request, { params }: { params: Promise<{ siteKey: string }> }): Promise<NextResponse> {
  const { siteKey } = await params;
  const resolved = await resolveConnectSite(req, siteKey, { write: false });
  if (!resolved.ok) return resolved.response;
  try {
    const context = await readPublicContext(siteKey, resolved.site);
    if (!context) return connectJson({ error: "Site not found." }, 404);
    return connectJson(context, 200, { "Cache-Control": "public, max-age=60, s-maxage=60" });
  } catch (error) {
    return connectErrorResponse(error, "context");
  }
}
