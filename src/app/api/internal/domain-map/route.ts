import { NextResponse } from "next/server";
import { getTenantByDomain } from "@/lib/tenants";

/**
 * Internal API for domain lookup.
 * Used by middleware to resolve custom domains to tenants.
 *
 * GET /api/internal/domain-map?domain=example.com
 */
export async function GET(request: Request) {
  // Validate internal API secret
  const expectedSecret = process.env.INTERNAL_API_SECRET;
  const providedSecret = request.headers.get("x-internal-secret");
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Additional validation: require internal request header
  const internalHeader = request.headers.get("x-internal-request");
  if (internalHeader !== "1") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const domain = url.searchParams.get("domain");

  if (!domain) {
    return NextResponse.json({ error: "domain parameter required" }, { status: 400 });
  }

  const result = await getTenantByDomain(domain);

  if (!result) {
    return NextResponse.json({ tenant: null, isAdmin: false });
  }

  return NextResponse.json({ tenant: result.tenantId, isAdmin: result.isAdmin });
}
