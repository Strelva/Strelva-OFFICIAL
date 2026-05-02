import { NextResponse } from "next/server";
import { getPageConfig } from "@/lib/storage";
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

    const pageConfig = await getPageConfig(tenant);
    return NextResponse.json(pageConfig);
  } catch (err) {
    console.error("[public page-config GET]", tenant, err);
    return NextResponse.json({ error: "Failed to load page config" }, { status: 500 });
  }
}
