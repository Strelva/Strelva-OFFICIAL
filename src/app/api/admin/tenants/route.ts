import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/auth";
import { getAllTenants, createTenant, updateTenant } from "@/lib/tenants";

export async function GET() {
  const admin = await isSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenants = await getAllTenants();
  return NextResponse.json(tenants);
}

export async function POST(req: Request) {
  const admin = await isSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { siteName, ownerName, ownerEmail, industry, template, subdomain, features } = body;

  if (!siteName || !ownerName || !industry || !template || !subdomain) {
    return NextResponse.json(
      { error: "Missing required fields: siteName, ownerName, industry, template, subdomain" },
      { status: 400 }
    );
  }

  try {
    const tenant = await createTenant({
      siteName,
      ownerName,
      ownerEmail,
      industry,
      template,
      subdomain,
      features: features || [],
    });
    return NextResponse.json(tenant, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create tenant" },
      { status: 409 }
    );
  }
}

export async function PATCH(req: Request) {
  const admin = await isSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, ...updates } = await req.json();
  if (!id) {
    return NextResponse.json({ error: "Missing tenant id" }, { status: 400 });
  }

  const updated = await updateTenant(id, updates);
  if (!updated) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}
