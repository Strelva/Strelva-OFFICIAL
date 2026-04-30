import { NextResponse } from "next/server";
import { verifyAuth, requireTenantAccess } from "@/lib/auth";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getEvents, getQueueCount } from "@/lib/events";
import { requireActiveSubscription } from "@/lib/subscription";

export async function GET() {
  const authed = await verifyAuth();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await getTenantFromHeaders();
  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;

  const blocked = await requireActiveSubscription(tenant);
  if (blocked) return blocked;

  const events = await getEvents(tenant, { status: "pending" });
  const count = await getQueueCount(tenant);

  return NextResponse.json({ events, count });
}
