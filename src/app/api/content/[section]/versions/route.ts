import { NextResponse } from "next/server";
import { getVersions, restoreVersion } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { requireTenantAccess } from "@/lib/auth";
import { getTemplateForTenant } from "@/components/templates/registry";
import type { ContentSection } from "@/lib/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ section: string }> }
) {
  const { section } = await params;

  try {
    const tenant = await getTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;

    const template = await getTemplateForTenant(tenant);
    if (!template.contentSections.includes(section as ContentSection)) {
      return NextResponse.json({ error: "Invalid section" }, { status: 400 });
    }

    const versions = await getVersions(section as ContentSection, tenant);
    return NextResponse.json(versions);
  } catch (err) {
    console.error("[versions GET]", section, err);
    return NextResponse.json({ error: "Failed to load versions" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ section: string }> }
) {
  const { section } = await params;

  try {
    const tenant = await getTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;

    const template = await getTemplateForTenant(tenant);
    if (!template.contentSections.includes(section as ContentSection)) {
      return NextResponse.json({ error: "Invalid section" }, { status: 400 });
    }

    const { versionId } = await request.json();
    if (typeof versionId !== "string") {
      return NextResponse.json({ error: "versionId required" }, { status: 400 });
    }

    const restored = await restoreVersion(section as ContentSection, versionId, tenant);
    if (!restored) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, version: restored });
  } catch (err) {
    console.error("[versions POST]", section, err);
    return NextResponse.json({ error: "Failed to restore" }, { status: 500 });
  }
}
