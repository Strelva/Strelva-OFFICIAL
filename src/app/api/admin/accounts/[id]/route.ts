import { NextResponse } from "next/server";
import { isSuperAdmin, getActorContext } from "@/lib/auth";
import { logAuditEvent } from "@/lib/storage";
import { readJsonObject } from "@/lib/request-body";
import {
  getAccount,
  updateAccount,
  linkTenantToAccount,
  unlinkTenant,
  deleteAccount,
} from "@/lib/accounts";

/**
 * Super-admin account detail. One PATCH handles both field edits AND site
 * membership so the operator UI can rename, reassign sites, and set status from
 * one place:
 *   { name?, primaryContactName?, primaryContactEmail?, phone?, notes?, status? }
 *   { linkTenant: "<tenantId>" }    -> attach a site (repoints if it was elsewhere)
 *   { unlinkTenant: "<tenantId>" }  -> detach a site
 * DELETE removes the account (its sites become standalone again). Audit-logged.
 */
async function guard(id: string) {
  if (!(await isSuperAdmin())) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  const account = await getAccount(id);
  if (!account) {
    return { error: NextResponse.json({ error: "Account not found" }, { status: 404 }) };
  }
  return { error: null as null, account };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(id);
  if (g.error) return g.error;
  return NextResponse.json({ account: g.account });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(id);
  if (g.error) return g.error;

  const body = await readJsonObject(req);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Site membership actions take precedence (they're the common operator edit).
  if (typeof body.linkTenant === "string" && body.linkTenant.trim()) {
    const tenantId = body.linkTenant.trim();
    const account = await linkTenantToAccount(id, tenantId);
    await logAuditEvent({
      tenant: id,
      action: "account.link_site",
      targetType: "account",
      targetId: id,
      actor: await getActorContext(),
      metadata: { tenantId },
    });
    return NextResponse.json({ success: true, account });
  }

  if (typeof body.unlinkTenant === "string" && body.unlinkTenant.trim()) {
    const tenantId = body.unlinkTenant.trim();
    const account = await unlinkTenant(id, tenantId);
    await logAuditEvent({
      tenant: id,
      action: "account.unlink_site",
      targetType: "account",
      targetId: id,
      actor: await getActorContext(),
      metadata: { tenantId },
    });
    return NextResponse.json({ success: true, account });
  }

  const account = await updateAccount(id, {
    ...(typeof body.name === "string" ? { name: body.name } : {}),
    ...(typeof body.primaryContactName === "string" ? { primaryContactName: body.primaryContactName } : {}),
    ...(typeof body.primaryContactEmail === "string" ? { primaryContactEmail: body.primaryContactEmail } : {}),
    ...(typeof body.phone === "string" ? { phone: body.phone } : {}),
    ...(typeof body.notes === "string" ? { notes: body.notes } : {}),
    ...(body.status === "active" || body.status === "paused" || body.status === "churned"
      ? { status: body.status }
      : {}),
  });

  await logAuditEvent({
    tenant: id,
    action: "account.update",
    targetType: "account",
    targetId: id,
    actor: await getActorContext(),
    metadata: { fields: Object.keys(body) },
  });

  return NextResponse.json({ success: true, account });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(id);
  if (g.error) return g.error;

  const removed = await deleteAccount(id);
  await logAuditEvent({
    tenant: id,
    action: "account.delete",
    targetType: "account",
    targetId: id,
    actor: await getActorContext(),
    metadata: { removed },
  });
  return NextResponse.json({ ok: true, removed });
}
