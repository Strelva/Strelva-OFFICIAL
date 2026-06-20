/**
 * Strelva v1 public collections API — single entry.
 *
 * Stable contract consumed by custom-repo client sites. Returns one PUBLISHED
 * entry by slug (or any status when preview=true). Versioned contract.
 */
import { NextResponse } from "next/server";
import { getEntryBySlug } from "@/lib/db/repositories";
import { isCollectionType } from "@/lib/cms/collection-types";
import { getTenantConfig } from "@/lib/tenants";
import { toPublicEntry } from "@/lib/cms/public-entry";
import { isAuthorizedPreview } from "@/lib/preview-auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenant: string; type: string; slug: string }> }
) {
  const { tenant, type, slug } = await params;

  if (!/^[a-z0-9-]+$/.test(tenant)) {
    return NextResponse.json({ error: "Invalid tenant" }, { status: 400 });
  }
  if (!isCollectionType(type)) {
    return NextResponse.json({ error: "Invalid collection type" }, { status: 400 });
  }

  try {
    const config = await getTenantConfig(tenant);
    if (!config || config.active === false) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    const entry = await getEntryBySlug(tenant, type, slug);
    const preview = isAuthorizedPreview(request, tenant, config.revalidationSecret);
    if (!entry || (!preview && entry.status !== "published")) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }
    return NextResponse.json(toPublicEntry(entry));
  } catch (err) {
    console.error("[v1 collection entry GET]", tenant, type, slug, err);
    return NextResponse.json({ error: "Failed to load entry" }, { status: 500 });
  }
}
