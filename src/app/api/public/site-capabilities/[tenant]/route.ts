import { NextResponse } from "next/server";
import { getSiteCapabilityManifest } from "@/lib/site-capabilities";
import { getTenantConfig } from "@/lib/tenants";

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

    return NextResponse.json(await getSiteCapabilityManifest(tenant));
  } catch (err) {
    console.error("[public site-capabilities GET]", tenant, err);
    return NextResponse.json({ error: "Failed to load site capabilities" }, { status: 500 });
  }
}
