import { NextResponse } from "next/server";
import { isSuperAdmin, getActorContext, getTenantOwnerUserIds, LastOwnerError } from "@/lib/auth";
import { getTenantConfig } from "@/lib/tenants";
import { logAuditEvent } from "@/lib/storage";
import { listTenantMembers, deleteMembership } from "@/lib/db/repositories";

/**
 * Tenant membership list and revoke — super-admin only.
 *
 * GET    — list all members (email + role) for the tenant.
 * DELETE — revoke a membership by userId. Refuses to remove the last owner.
 */

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!(await getTenantConfig(id))) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }
  const members = await listTenantMembers(id);
  return NextResponse.json({ members });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!(await getTenantConfig(id))) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { userId } = (body ?? {}) as { userId?: unknown };
  if (typeof userId !== "string" || !userId.trim()) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  // Last-owner guard: refuse to remove the sole owner.
  const ownerIds = await getTenantOwnerUserIds(id);
  const isSoleOwner =
    ownerIds.length === 1 && ownerIds[0] === userId;
  if (isSoleOwner) {
    return NextResponse.json(
      { error: "Cannot revoke the last owner of this tenant" },
      { status: 409 }
    );
  }

  try {
    await deleteMembership(userId, id);
  } catch (err) {
    if (err instanceof LastOwnerError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to revoke membership" },
      { status: 500 }
    );
  }

  await logAuditEvent({
    tenant: id,
    action: "tenant.revoke_user",
    targetType: "user",
    targetId: userId,
    actor: await getActorContext(id),
    metadata: {},
  }).catch(() => {});

  const members = await listTenantMembers(id);
  return NextResponse.json({ members });
}
