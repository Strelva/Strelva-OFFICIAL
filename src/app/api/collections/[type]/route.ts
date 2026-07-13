/**
 * Authenticated Collections CMS CRUD (the basic client editor + admin/agent).
 * Tenant comes from the request host/headers and is access-gated, so a user of
 * one tenant cannot touch another's entries. The public storefront read is the
 * separate tenant-in-path /api/v1/collections/* route.
 */
import { NextResponse } from "next/server";
import { isCollectionType, type CollectionType } from "@/lib/cms/collection-types";
import { listEntriesForType, saveEntry, removeEntry } from "@/lib/cms/collections-service";
import { requireTenantFromHeaders } from "@/lib/tenant";
import { requireTenantAccess, requireTenantPermission, getActorContext } from "@/lib/auth";
import { readJsonObject } from "@/lib/request-body";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params;
  if (!isCollectionType(type)) {
    return NextResponse.json({ error: "Invalid collection type" }, { status: 400 });
  }
  const tenant = await requireTenantFromHeaders();
  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;

  const statusParam = new URL(request.url).searchParams.get("status");
  const status = statusParam === "published" || statusParam === "draft" ? statusParam : undefined;
  const entries = await listEntriesForType(tenant, type as CollectionType, { status });
  return NextResponse.json({ entries });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params;
  if (!isCollectionType(type)) {
    return NextResponse.json({ error: "Invalid collection type" }, { status: 400 });
  }
  const tenant = await requireTenantFromHeaders();
  const permissionDenied = await requireTenantPermission(tenant, "content:write");
  if (permissionDenied) return permissionDenied;
  const actor = await getActorContext(tenant);

  const body = await readJsonObject(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const data = body.data;
  if (data === null || typeof data !== "object") {
    return NextResponse.json({ error: "Missing entry data" }, { status: 400 });
  }
  const status = body.status === "published" ? "published" : "draft";
  const slug = typeof body.slug === "string" ? body.slug : undefined;

  const result = await saveEntry({
    tenant,
    type: type as CollectionType,
    slug,
    data: data as Record<string, unknown>,
    status,
    actor: actor.isImpersonating ? "admin" : "user",
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }
  return NextResponse.json({ success: true, entry: result.entry });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params;
  if (!isCollectionType(type)) {
    return NextResponse.json({ error: "Invalid collection type" }, { status: 400 });
  }
  const tenant = await requireTenantFromHeaders();
  const permissionDenied = await requireTenantPermission(tenant, "content:write");
  if (permissionDenied) return permissionDenied;
  const actor = await getActorContext(tenant);

  const slug = new URL(request.url).searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }
  await removeEntry(tenant, type as CollectionType, slug, actor.isImpersonating ? "admin" : "user");
  return NextResponse.json({ success: true });
}
