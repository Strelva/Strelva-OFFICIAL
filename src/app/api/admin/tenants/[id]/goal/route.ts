import { NextResponse } from "next/server";
import { isSuperAdmin, getActorContext } from "@/lib/auth";
import { getTenantConfig } from "@/lib/tenants";
import { logAuditEvent } from "@/lib/storage";
import { setGoal, clearGoal, type GoalMetric } from "@/lib/goals";

/**
 * Operator-set weekly goal for a managed client. Managed owners rarely log into
 * the dashboard, so the operator sets the goal (what the business is trying to
 * grow) on their behalf here. Super-admin only, audit-logged.
 *
 * PUT    — set { metric, target }
 * DELETE — clear the goal
 */

const VALID_METRICS: GoalMetric[] = ["visitors", "calls", "bookings", "reviews"];

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!(await getTenantConfig(id))) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => null)) as { metric?: unknown; target?: unknown } | null;
  const metric = body?.metric;
  const target = Number(body?.target);
  if (typeof metric !== "string" || !VALID_METRICS.includes(metric as GoalMetric)) {
    return NextResponse.json({ error: "Pick a goal metric." }, { status: 400 });
  }
  if (!Number.isFinite(target) || target <= 0) {
    return NextResponse.json({ error: "Set a weekly target above zero." }, { status: 400 });
  }

  const goal = await setGoal(id, metric as GoalMetric, target);
  if (!goal) {
    return NextResponse.json({ error: "Couldn't save the goal (storage unavailable)." }, { status: 503 });
  }
  await logAuditEvent({
    tenant: id,
    action: "goal.set",
    targetType: "tenant",
    targetId: id,
    actor: await getActorContext(id),
    metadata: { metric, target },
  }).catch(() => {});
  return NextResponse.json({ goal });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!(await getTenantConfig(id))) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }
  await clearGoal(id);
  await logAuditEvent({
    tenant: id,
    action: "goal.clear",
    targetType: "tenant",
    targetId: id,
    actor: await getActorContext(id),
  }).catch(() => {});
  return NextResponse.json({ ok: true });
}
