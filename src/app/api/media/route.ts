import { authorizeTenantOperatorRead } from "@/platform/operator-read-audit/admission";
import { NextResponse } from "next/server";
import { verifyAuth, requireTenantAccess, requireTenantPermission } from "@/platform/infra/auth";
import { getTenantFromHeaders } from "@/lib/tenant";
import { requireActiveSubscription } from "@/lib/subscription";
import { isRateLimitedAsync, rateLimitKey } from "@/platform/infra/rate-limit";
import { listTenantMedia, deleteTenantMedia, uploadTenantImageFile, mediaUploadErrorResponse } from "@/platform/infra/media/store";

// --- GET: List image assets for this tenant (Vercel Blob) ---

export async function GET() {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenant = await getTenantFromHeaders();
  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;
  await authorizeTenantOperatorRead(tenant);

  const assets = await listTenantMedia(tenant);
  return NextResponse.json({ assets });
}

// --- POST: Upload a new image to the tenant's Blob library ---

export async function POST(request: Request) {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenant = await getTenantFromHeaders();
  const permissionDenied = await requireTenantPermission(tenant, "content:write");
  if (permissionDenied) return permissionDenied;
  const blocked = await requireActiveSubscription(tenant);
  if (blocked) return blocked;

  // Cap uploads per tenant — each writes a 5MB file, so an authed editor
  // shouldn't be able to hammer the store.
  if (await isRateLimitedAsync(rateLimitKey(request, `media:${tenant}`), 20)) {
    return NextResponse.json({ error: "Too many uploads, slow down" }, { status: 429 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  try {
    const asset = await uploadTenantImageFile(tenant, file);
    return NextResponse.json(asset, { status: 201 });
  } catch (err) {
    const { status, error } = mediaUploadErrorResponse(err);
    return NextResponse.json({ error }, { status });
  }
}

// --- DELETE: Remove an image asset owned by this tenant ---

export async function DELETE(request: Request) {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenant = await getTenantFromHeaders();
  const permissionDenied = await requireTenantPermission(tenant, "content:write");
  if (permissionDenied) return permissionDenied;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing asset id" }, { status: 400 });
  }

  // Tenant-scoped delete: Blob assets by pathname prefix. Prevents deleting
  // another tenant's media by guessing an id.
  const result = await deleteTenantMedia(tenant, id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Delete failed" }, { status: result.status });
  }

  return NextResponse.json({ success: true });
}
