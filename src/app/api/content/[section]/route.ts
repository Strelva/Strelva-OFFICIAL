import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import type { ContentMap, ContentSection } from "@/lib/types";
import {
  getContent,
  setContent,
  recordSectionUpdate,
  logActivity,
  logAuditEvent,
  getDraftContent,
  setDraftContent,
  clearDraft,
  appendVersion,
} from "@/lib/storage";
import { diffFields } from "@/lib/utils";
import { requireTenantFromHeaders } from "@/lib/tenant";
import { getTemplateManifestForTenant } from "@/lib/template-manifests";
import { getActorContext, requireTenantAccess, requireTenantPermission } from "@/lib/auth";
import { requireActiveSubscription } from "@/lib/subscription";
import { revalidateClientSite } from "@/lib/revalidate-client";
import { readJsonObject } from "@/lib/request-body";
import { sectionSchemas } from "@/lib/schemas";
import { clientRevalidationTargetForSections } from "@/lib/content-revalidation";
import { scheduleVerification } from "@/lib/verify-live";

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

    if (!(await isValidSection(section, tenant))) {
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
    const changes = diffFields(current, parsed.data as Record<string, unknown>);

    await setContent(s, parsed.data as ContentMap[typeof s], tenant);
    // Content is now live. Version history + the section timestamp are
    // bookkeeping — if one throws here, DON'T 500 (that would tell the owner the
    // save failed when it actually succeeded, and they'd retry / lose trust).
    try {
      await appendVersion(s, parsed.data, actor.isImpersonating ? "admin" : "user", tenant, changes);
      await recordSectionUpdate(s, tenant);
    } catch (err) {
      console.error("[content PUT] post-write bookkeeping failed (content IS saved):", s, err);
    }
    await logActivity({
      text: actor.isImpersonating ? `Strelva admin updated ${s}` : `Updated ${s} via admin`,
      time: new Date().toISOString(),
      type: "admin",
      section: s,
      actor: actor.isImpersonating ? "admin" : "user",
      changes,
      snapshot: current,
    }, tenant);
    await logAuditEvent({
      tenant,
      actor,
      action: "content.published",
      targetType: "content_section",
      targetId: s,
      metadata: { section: s, changeCount: changes.length },
    });

    await clearDraft(s, tenant).catch((err) =>
      // A leftover draft after publish would resurface as a phantom unsaved
      // change; log it (matches the revalidate-failure logging just below).
      console.error("[content PUT] failed to clear draft after publish:", s, err),
    );

    revalidatePath("/");

    // Trigger revalidation on standalone client site. Settings-like sections
    // affect layout, metadata, links, and design tokens across many routes.
    revalidateClientSite(tenant, clientRevalidationTargetForSections([s])).catch((err) => {
      console.error("[content PUT] Failed to revalidate client site:", err);
    });

    // Fire-and-forget verification: confirms the change is live on the public
    // read path and emits a change_verified / change_verify_failed event.
    scheduleVerification(tenant, s, parsed.data as Record<string, unknown>);

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
