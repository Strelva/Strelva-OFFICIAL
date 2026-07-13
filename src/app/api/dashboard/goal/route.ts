import { NextResponse } from "next/server";
import { getTenantFromHeaders } from "@/lib/tenant";
import { requireTenantAccess, requireTenantPermission } from "@/lib/auth";
import { getGoal, setGoal, clearGoal } from "@/lib/goals";
import type { MetricKey } from "@/lib/proof";

/** GET the tenant's weekly goal (or null). */
export async function GET() {
  const tenant = await getTenantFromHeaders();
  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;
  return NextResponse.json({ goal: await getGoal(tenant) });
}

/** PUT { metric, target } to set the weekly goal. */
export async function PUT(req: Request) {
  const tenant = await getTenantFromHeaders();
  const blocked = await requireTenantPermission(tenant, "settings:write");
  if (blocked) return blocked;

  const body = await req.json().catch(() => null);
  const goal = await setGoal(tenant, body?.metric as MetricKey, Number(body?.target));
  if (!goal) return NextResponse.json({ error: "Pick a metric and a target above zero." }, { status: 400 });
  return NextResponse.json({ goal });
}

/** DELETE the weekly goal. */
export async function DELETE() {
  const tenant = await getTenantFromHeaders();
  const blocked = await requireTenantPermission(tenant, "settings:write");
  if (blocked) return blocked;

  await clearGoal(tenant);
  return NextResponse.json({ ok: true });
}
