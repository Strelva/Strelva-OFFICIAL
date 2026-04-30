import { NextResponse } from "next/server";
import { verifyAuth, requireTenantAccess } from "@/lib/auth";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getActivatedCapabilities } from "@/lib/capabilities";

export async function GET() {
  const authed = await verifyAuth();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await getTenantFromHeaders();
  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;

  const { capabilities } = await getActivatedCapabilities(tenant);

  return NextResponse.json({
    capabilities: capabilities.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      available: c.available,
    })),
  });
}
