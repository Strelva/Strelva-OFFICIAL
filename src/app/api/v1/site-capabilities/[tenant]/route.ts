/**
 * Strelva v1 public site-capabilities API.
 *
 * Stable contract consumed by custom-repo client sites. Change the response
 * shape only by versioning (add a v2 sibling).
 */
import { NextResponse } from "next/server";
import { getSiteCapabilityManifest } from "@/lib/site-capabilities";
import { getTenantConfig } from "@/lib/tenants";

// Tenant-private: never let a shared/CDN cache serve one tenant's manifest to another.
const TENANT_PRIVATE_CACHE = "private, max-age=0, must-revalidate";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tenant: string }> }
) {
  const { tenant } = await params;

  if (!/^[a-z0-9-]+$/.test(tenant)) {
    return NextResponse.json({ error: "Invalid tenant" }, { status: 400 });
  }

  try {
    const config = await getTenantConfig(tenant);
    if (!config || config.active === false) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    return NextResponse.json(await getSiteCapabilityManifest(tenant), {
      headers: { "Cache-Control": TENANT_PRIVATE_CACHE },
    });
  } catch (err) {
    console.error("[v1 site-capabilities GET]", tenant, err);
    return NextResponse.json(
      { error: "Failed to load site capabilities" },
      { status: 500 },
    );
  }
}
