/**
 * Strelva v1 public collections API — list.
 *
 * Stable contract consumed by custom-repo client sites (Collections CMS, see
 * docs/strelva-cms-scope.md). Returns PUBLISHED entries of a collection type for
 * a tenant. Change the shape only by versioning (add a v2 sibling).
 */
import { NextResponse } from "next/server";
import { listEntries } from "@/lib/db/repositories";
import { isCollectionType } from "@/lib/cms/collection-types";
import { getTenantConfig } from "@/lib/tenants";
import { toPublicEntry } from "@/lib/cms/public-entry";
import { isAuthorizedPreview } from "@/lib/preview-auth";

// Per-tenant content is tenant-private: a shared/CDN cache must never store one
// tenant's response and serve it to another. No CDN sits in front today, but
// this closes the latent cross-tenant bleed before one ever does.
// Matches the pattern in content/route.ts, page-config/route.ts, and
// site-capabilities/route.ts.
const TENANT_PRIVATE_CACHE = "private, max-age=0, must-revalidate";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenant: string; type: string }> }
) {
  const { tenant, type } = await params;

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

    // Public reads expose published entries only. Drafts require a signed
    // preview token (tenant revalidationSecret); an unauthorized ?preview=true
    // degrades to published. See preview-auth.ts.
    const preview = isAuthorizedPreview(request, tenant, config.revalidationSecret);
    const rows = await listEntries(tenant, type, preview ? undefined : { status: "published" });
    return NextResponse.json({ entries: rows.map(toPublicEntry) }, {
      headers: { "Cache-Control": TENANT_PRIVATE_CACHE },
    });
  } catch (err) {
    console.error("[v1 collections GET]", tenant, type, err);
    return NextResponse.json({ error: "Failed to load collection" }, { status: 500 });
  }
}
