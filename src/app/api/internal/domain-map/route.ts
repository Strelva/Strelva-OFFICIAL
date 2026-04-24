import { NextResponse } from "next/server";
import { getTenantByDomain } from "@/lib/tenants";

/**
 * Internal API for domain lookup.
 * Used by middleware to resolve custom domains to tenants.
 *
 * GET /api/internal/domain-map?domain=example.com
 */
export async function GET(request: Request) {
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
