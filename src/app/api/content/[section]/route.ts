import { authorizeTenantOperatorRead } from "@/platform/operator-read-audit/admission";
import { NextResponse } from "next/server";
import type { ContentMap, ContentSection } from "@/lib/types";
import {
  getContent,
  logAuditEvent,
  getDraftContent,
  setDraftContent,
  clearDraft,
} from "@/lib/storage";
import { requireTenantFromHeaders } from "@/lib/tenant";
import { getTemplateManifestForTenant } from "@/lib/template-manifests";
import { getActorContext, requireTenantAccess, requireTenantPermission } from "@/platform/infra/auth";
import { requireActiveSubscription } from "@/lib/subscription";
import { readJsonObject } from "@/lib/request-body";
import { sectionSchemas } from "@/lib/schemas";
import { publishTenantSections } from "@/products/websites/publish/tenant-sections";

async function isValidSection(section: string, tenant: string): Promise<boolean> {
  const template = await getTemplateManifestForTenant(tenant);
  return template.contentSections.includes(section as ContentSection);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ section: string }> }
) {
  const { section } = await params;

  try {
    const tenant = await requireTenantFromHeaders();
    // Authenticated content read — gate on tenant access so a logged-in user of
    // one tenant cannot read another tenant's content or unpublished drafts.
    // (The public storefront read is the separate, tenant-in-path /api/v1/* route.)
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;
    await authorizeTenantOperatorRead(tenant);

    // A known section TYPE that this tenant's template doesn't include still has
    // a valid (empty) read — getContent returns null. Only a genuinely unknown
    // section name is a bad request. This stops optional-section editors (the
    // Settings nav/footer editor) from 400ing on every load when the template
    // omits those sections. Writes (PUT/DELETE) still gate on isValidSection.
    if (!Object.prototype.hasOwnProperty.call(sectionSchemas, section)) {
      return NextResponse.json({ error: "Invalid section" }, { status: 400 });
    }
    const s = section as ContentSection;

    const url = new URL(request.url);
    const isDraft = url.searchParams.get("draft") === "true";

    if (isDraft) {
      const draft = await getDraftContent(s, tenant);
      if (draft) return NextResponse.json(draft);
    }

    const data = await getContent(s, tenant);
    return NextResponse.json(data);
  } catch (err) {
    console.error("[content GET]", section, err);
    return NextResponse.json({ error: "Failed to load content" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ section: string }> }
) {
  const { section } = await params;

  try {
    const tenant = await requireTenantFromHeaders();
    const permissionDenied = await requireTenantPermission(tenant, "content:write");
    if (permissionDenied) return permissionDenied;
    const actor = await getActorContext(tenant);
    const blocked = await requireActiveSubscription(tenant);
    if (blocked) return blocked;

    if (!(await isValidSection(section, tenant))) {
      return NextResponse.json({ error: "Invalid section" }, { status: 400 });
    }
    const s = section as ContentSection;

    const body = await readJsonObject(request);
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const parsed = sectionSchemas[s].safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid section content" },
        { status: 422 }
      );
    }

    const url = new URL(request.url);
    const isDraft = url.searchParams.get("draft") === "true";

    if (isDraft) {
      await setDraftContent(s, parsed.data as ContentMap[typeof s], tenant);
      await logAuditEvent({
        tenant,
        actor,
        action: "content.draft_saved",
        targetType: "content_section",
        targetId: s,
        metadata: { section: s },
      });
      return NextResponse.json({ success: true, draft: true });
    }

    const current = await getContent(s, tenant) as unknown as Record<string, unknown>;

    // Content goes live here, then version history, the section timestamp,
    // activity and audit follow. Version history + the timestamp are
    // bookkeeping: if one throws, DON'T 500 (that would tell the owner the
    // save failed when it actually succeeded, and they'd retry / lose trust).
    // A leftover draft after publish would resurface as a phantom unsaved
    // change, so a failed clear is logged. Settings-like sections affect
    // layout, metadata, links and design tokens across many routes, so the
    // client site revalidates the matching targets; verification confirms the
    // change is live on the public read path.
    await publishTenantSections({
      tenantId: tenant,
      writes: [{ section: s, data: parsed.data as ContentMap[typeof s], prior: current }],
      author: actor.isImpersonating ? "admin" : "user",
      versions: "best_effort",
      activity: { mode: "strict", text: () => (actor.isImpersonating ? `Strelva admin updated ${s}` : `Updated ${s} via admin`) },
      audit: { actor },
      clearDrafts: "best_effort",
      verify: true,
      onRevalidateError: (err) => console.error("[content PUT] Failed to revalidate client site:", err),
      messages: {
        versions: (section) => ["[content PUT] post-write bookkeeping failed (content IS saved):", section],
        clearDraft: ([section]) => ["[content PUT] failed to clear draft after publish:", section],
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[content PUT]", section, err);
    return NextResponse.json({ error: "Failed to save content" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ section: string }> }
) {
  const { section } = await params;

  try {
    const tenant = await requireTenantFromHeaders();
    const permissionDenied = await requireTenantPermission(tenant, "content:write");
    if (permissionDenied) return permissionDenied;
    const actor = await getActorContext(tenant);
    const blocked = await requireActiveSubscription(tenant);
    if (blocked) return blocked;

    if (!(await isValidSection(section, tenant))) {
      return NextResponse.json({ error: "Invalid section" }, { status: 400 });
    }
    const s = section as ContentSection;

    const url = new URL(request.url);
    const isDraft = url.searchParams.get("draft") === "true";

    if (isDraft) {
      await clearDraft(s, tenant);
      await logAuditEvent({
        tenant,
        actor,
        action: "content.draft_deleted",
        targetType: "content_section",
        targetId: s,
        metadata: { section: s },
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "DELETE only supported for drafts" }, { status: 400 });
  } catch (err) {
    console.error("[content DELETE]", section, err);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
