import { NextResponse } from "next/server";
import { getTenantFromHeaders } from "@/lib/tenant";
import { requireTenantPermission, verifyAuth } from "@/lib/auth";
import { getOffboardingSnapshot } from "@/lib/offboarding";

export async function GET() {
  const authed = await verifyAuth();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const tenant = await getTenantFromHeaders();
    const denied = await requireTenantPermission(tenant, "billing:manage");
    if (denied) return denied;
    return NextResponse.json(await getOffboardingSnapshot(tenant));
  } catch (error) {
    console.error("[offboarding/status GET]", error);
    return NextResponse.json({ error: "Could not load handoff status" }, { status: 500 });
  }
}
