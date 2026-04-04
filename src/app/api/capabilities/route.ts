import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getActivatedCapabilities, TIER_PRICING } from "@/lib/capabilities";

export async function GET() {
  const authed = await verifyAuth();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await getTenantFromHeaders();
  const { tier, capabilities } = await getActivatedCapabilities(tenant);

  return NextResponse.json({
    tier,
    pricing: TIER_PRICING,
    capabilities: capabilities.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      available: c.available,
    })),
  });
}
