import { NextResponse } from "next/server";
import { verifyAuth, requireTenantAccess } from "@/lib/auth";
import { getSubscribers } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";

export async function GET() {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenant = await getTenantFromHeaders();
  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;

  const subscribers = await getSubscribers(tenant);

  return NextResponse.json({ subscribers, count: subscribers.length });
}
