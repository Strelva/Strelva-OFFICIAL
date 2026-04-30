import { NextResponse } from "next/server";
import { verifyAuth, requireTenantAccess } from "@/lib/auth";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getWeeklyBrief } from "@/lib/weekly-brief";
import { requireActiveSubscription } from "@/lib/subscription";

export async function GET() {
  const authed = await verifyAuth();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await getTenantFromHeaders();
  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;

  const blocked = await requireActiveSubscription(tenant);
  if (blocked) return blocked;

  const brief = await getWeeklyBrief(tenant);
  if (!brief) {
    return NextResponse.json({ error: "No weekly brief available" }, { status: 404 });
  }

  return NextResponse.json({ brief });
}
