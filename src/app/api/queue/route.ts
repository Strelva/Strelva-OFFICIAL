import { authorizeTenantOperatorRead } from "@/platform/operator-read-audit/admission";
import { NextResponse } from "next/server";
import { verifyAuth, requireTenantAccess } from "@/platform/infra/auth";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getEvents, getQueueCount } from "@/lib/events";
import { requireActiveSubscription } from "@/lib/subscription";

// Legacy tenant dashboard read (QueuePage on /dashboard/review), kept for
// unconverted tenants. Approve and dismiss from that page record through Needs
// you for a converted business (see api/queue/[id]). Removal waits until
// owner-entry redirects cover every tenant.
export async function GET() {
  const authed = await verifyAuth();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await getTenantFromHeaders();
  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;
  await authorizeTenantOperatorRead(tenant);

  const blocked = await requireActiveSubscription(tenant);
  if (blocked) return blocked;

  const events = await getEvents(tenant, { status: "pending" });
  const count = await getQueueCount(tenant);

  return NextResponse.json({ events, count });
}
