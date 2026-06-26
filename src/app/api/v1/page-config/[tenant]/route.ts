/**
 * Strelva v1 public page-config API.
 *
 * Stable contract consumed by custom-repo client sites. Change the response
 * shape only by versioning (add a v2 sibling).
 */
import { NextResponse } from "next/server";
import { getDraftPageConfig, getPageConfig } from "@/lib/storage";
import { getSiteCapabilityManifest } from "@/lib/site-capabilities";
import { getTenantConfig } from "@/lib/tenants";
import { isAuthorizedPreview } from "@/lib/preview-auth";

// Tenant-private: never let a shared/CDN cache serve one tenant's config to another.
const TENANT_PRIVATE_CACHE = "private, max-age=0, must-revalidate";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenant: string }> }
) {
  const { tenant } = await params;

  if (!/^[a-z0-9-]+$/.test(tenant)) {
    return NextResponse.json({ error: "Invalid tenant" }, { status: 400 });
  }

  try {
    const config = await getTenantConfig(tenant);
    if (!config || config.active === false) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    const manifest = await getSiteCapabilityManifest(tenant);
    const preview = isAuthorizedPreview(request, tenant, config.revalidationSecret);
    const pageConfig =
      preview && manifest.supportsDraftPreview
        ? (await getDraftPageConfig(tenant)) || (await getPageConfig(tenant))
        : await getPageConfig(tenant);
    return NextResponse.json(pageConfig, {
      headers: { "Cache-Control": TENANT_PRIVATE_CACHE },
    });
  } catch (err) {
    console.error("[v1 page-config GET]", tenant, err);
    return NextResponse.json({ error: "Failed to load page config" }, { status: 500 });
  }
}
