import { NextResponse } from "next/server";
import { verifyAuth, requireTenantAccess, requireTenantPermission } from "@/lib/auth";
import { getSanityClient, getSanityReadClient } from "@/lib/sanity";
import { getTenantFromHeaders } from "@/lib/tenant";
import { requireActiveSubscription } from "@/lib/subscription";
import type { MediaAsset } from "@/lib/media";

const MAX_SIZE = 5 * 1024 * 1024;

// --- GET: List image assets for this tenant ---

export async function GET() {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenant = await getTenantFromHeaders();
  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;

  // Query assets tagged with this tenant's label, falling back to all assets
  const query = `*[_type == "sanity.imageAsset" && label == $tenant] | order(_createdAt desc) {
    _id,
    _createdAt,
    url,
    originalFilename,
    metadata { dimensions { width, height }, lqip },
    size
  }`;

  const raw = await getSanityReadClient().fetch(query, { tenant });

  const assets: MediaAsset[] = (raw || []).map(
    (doc: {
      _id: string;
      _createdAt: string;
      url: string;
      originalFilename: string;
      metadata?: { dimensions?: { width: number; height: number }; lqip?: string };
      size: number;
    }) => ({
      id: doc._id,
      url: doc.url,
      filename: doc.originalFilename || "untitled",
      width: doc.metadata?.dimensions?.width || 0,
      height: doc.metadata?.dimensions?.height || 0,
      size: doc.size || 0,
      lqip: doc.metadata?.lqip || undefined,
      createdAt: doc._createdAt,
    })
  );

  return NextResponse.json({ assets });
}

// --- POST: Upload a new image to Sanity ---

export async function POST(request: Request) {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenant = await getTenantFromHeaders();
  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;
  const permissionDenied = await requireTenantPermission(tenant, "content:write");
  if (permissionDenied) return permissionDenied;
  const blocked = await requireActiveSubscription(tenant);
  if (blocked) return blocked;

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "Invalid file type. Only images are allowed." },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const asset = await getSanityClient().assets.upload("image", buffer, {
    filename: file.name,
    contentType: file.type,
    label: tenant, // Tag with tenant ID for multi-tenant filtering
  });

  const result: MediaAsset = {
    id: asset._id,
    url: asset.url,
    filename: asset.originalFilename || file.name,
    width: asset.metadata?.dimensions?.width || 0,
    height: asset.metadata?.dimensions?.height || 0,
    size: asset.size || file.size,
    createdAt: asset._createdAt,
  };

  return NextResponse.json(result, { status: 201 });
}
