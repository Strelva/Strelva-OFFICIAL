import { NextResponse } from "next/server";
import { isSuperAdmin, getActorContext } from "@/lib/auth";
import { logAuditEvent } from "@/lib/storage";
import { readJsonObject } from "@/lib/request-body";
import { getAllAccounts, createAccount } from "@/lib/accounts";

/**
 * Super-admin ACCOUNT management. An account groups multiple sites (tenants)
 * under one customer/payer + bundled subscription (the operator org layer). This
 * is the collection endpoint:
 *   GET  -> list every account (newest first) with its sites + bundled sub snapshot
 *   POST -> create an account (optionally pre-linking sites)
 * Detail edits (link/unlink a site, rename, set status) live on
 * /api/admin/accounts/[id]. Every mutation is audit-logged.
 */
export async function GET() {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const accounts = await getAllAccounts();
  return NextResponse.json({ accounts, count: accounts.length });
}

export async function POST(req: Request) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await readJsonObject(req);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Account name is required" }, { status: 400 });
  }

  const tenantIds = Array.isArray(body.tenantIds)
    ? body.tenantIds.filter((t): t is string => typeof t === "string")
    : [];

  const account = await createAccount({
    name,
    primaryContactName: typeof body.primaryContactName === "string" ? body.primaryContactName : undefined,
    primaryContactEmail: typeof body.primaryContactEmail === "string" ? body.primaryContactEmail : undefined,
    phone: typeof body.phone === "string" ? body.phone : undefined,
    notes: typeof body.notes === "string" ? body.notes : undefined,
    tenantIds,
  });

  await logAuditEvent({
    tenant: account.id,
    action: "account.create",
    targetType: "account",
    targetId: account.id,
    actor: await getActorContext(),
    metadata: { name: account.name, tenantIds: account.tenantIds },
  });

  return NextResponse.json({ success: true, account });
}
