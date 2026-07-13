import { NextResponse } from "next/server";
import { getVersions, logActivity, logAuditEvent, restoreVersion } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getActorContext, requireTenantAccess, requireTenantPermission } from "@/lib/auth";
import { getTemplateManifestForTenant } from "@/lib/template-manifests";
import type { ContentSection } from "@/lib/types";
import { requireActiveSubscription } from "@/lib/subscription";
import { readJsonObject } from "@/lib/request-body";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ section: string }> }
) {
  const { section } = await params;

  try {
    const tenant = await getTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;

    const template = await getTemplateManifestForTenant(tenant);
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
    const permissionDenied = await requireTenantPermission(tenant, "content:write");
    if (permissionDenied) return permissionDenied;
    const blocked = await requireActiveSubscription(tenant);
    if (blocked) return blocked;
    const actor = await getActorContext(tenant);

    const template = await getTemplateManifestForTenant(tenant);
    if (!template.contentSections.includes(section as ContentSection)) {
      return NextResponse.json({ error: "Invalid section" }, { status: 400 });
    }

    const body = await readJsonObject(request);
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { versionId } = body;
    if (typeof versionId !== "string") {
      return NextResponse.json({ error: "versionId required" }, { status: 400 });
    }

    const restored = await restoreVersion(
      section as ContentSection,
      versionId,
      tenant,
      actor.isImpersonating ? "admin" : "user"
    );
    if (!restored) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }
    await logActivity({
      text: actor.isImpersonating
        ? `Strelva admin restored ${section} from version history`
        : `Restored ${section} from version history`,
      time: new Date().toISOString(),
      type: "admin",
      section,
      actor: actor.isImpersonating ? "admin" : "user",
      changes: restored.changes,
    }, tenant);
    if (actor.isImpersonating) {
      await logAuditEvent({
        tenant,
        actor,
        action: "content.version_restored",
        targetType: "content_section",
        targetId: section,
        metadata: { section, versionId },
      });
    }

    return NextResponse.json({ success: true, version: restored });
  } catch (err) {
    console.error("[versions POST]", section, err);
    return NextResponse.json({ error: "Failed to restore" }, { status: 500 });
  }
}
