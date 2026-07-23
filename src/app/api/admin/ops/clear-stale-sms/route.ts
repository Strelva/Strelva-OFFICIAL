import { NextResponse } from "next/server";
import { isSuperAdmin, getActorContext } from "@/lib/auth";
import { getRedis } from "@/lib/redis";
import { readJsonObject } from "@/lib/request-body";
import { logAuditEvent } from "@/lib/storage";

/**
 * Delete a stale SMS approval key for a tenant.
 * The key format `sms:pending:{tenantId}` is established in src/lib/ops.ts.
 * Super-admin only. Audit-logged.
 */
export async function POST(req: Request) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await readJsonObject(req);
  const tenantId = typeof body?.tenantId === "string" ? body.tenantId.trim() : "";
  if (!tenantId) {
    return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });
  }

  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ error: "Redis unavailable" }, { status: 503 });
  }

  const key = `sms:pending:${tenantId}`;
  const existing = await redis.get<{ sentAt?: string }>(key);
  if (!existing) {
    return NextResponse.json({ cleared: false, reason: "Key not found or already cleared" });
  }

  await redis.del(key);

  await logAuditEvent({
    tenant: tenantId,
    action: "ops.sms.clear_stale",
    targetType: "tenant",
    targetId: tenantId,
    actor: await getActorContext(tenantId),
    metadata: { sentAt: existing.sentAt ?? null },
  });

  return NextResponse.json({ cleared: true, tenantId });
}
