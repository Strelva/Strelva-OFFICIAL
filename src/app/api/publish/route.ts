import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import type { ContentMap, ContentSection } from "@/lib/types";
import {
  appendVersion,
  clearDraft,
  clearDraftPageConfig,
  getContent,
  getDraftContent,
  getDraftPageConfig,
  listDrafts,
  logActivity,
  logAuditEvent,
  recordSectionUpdate,
  setContent,
  setPageConfig,
} from "@/lib/storage";
import { requireTenantFromHeaders } from "@/lib/tenant";
import { getActorContext, requireTenantAccess, requireTenantPermission, verifyAuth } from "@/lib/auth";
import { requireActiveSubscription } from "@/lib/subscription";
import { getTemplateForTenant } from "@/components/templates/registry";
import { sectionSchemas } from "@/lib/schemas";
import { diffFields } from "@/lib/utils";
import { revalidateClientSite } from "@/lib/revalidate-client";
import { parseAndValidatePageConfig } from "@/lib/page-config-validation";

export async function GET() {
  const authed = await verifyAuth();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const tenant = await requireTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;

    const [contentDrafts, pageConfigDraft] = await Promise.all([
      listDrafts(tenant),
      getDraftPageConfig(tenant),
    ]);

    return NextResponse.json({
      contentDrafts,
      pageConfigDraft: Boolean(pageConfigDraft),
    });
  } catch (err) {
    console.error("[publish GET]", err);
    return NextResponse.json({ error: "Failed to load publish status" }, { status: 500 });
  }
}

export async function POST() {
  const authed = await verifyAuth();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const tenant = await requireTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;
    const permissionDenied = await requireTenantPermission(tenant, "content:write");
    if (permissionDenied) return permissionDenied;
    const blocked = await requireActiveSubscription(tenant);
    if (blocked) return blocked;

    const [template, contentDrafts, pageConfigDraft, actor] = await Promise.all([
      getTemplateForTenant(tenant),
      listDrafts(tenant),
      getDraftPageConfig(tenant),
      getActorContext(tenant),
    ]);

    const allowedSections = new Set(template.contentSections);
    const sectionNames = Object.keys(contentDrafts)
      .filter((section): section is ContentSection => allowedSections.has(section as ContentSection));

    const parsedDrafts: Array<{
      section: ContentSection;
      data: ContentMap[ContentSection];
    }> = [];

    for (const section of sectionNames) {
      const draft = await getDraftContent(section, tenant);
      if (!draft) continue;
      const parsed = sectionSchemas[section].safeParse(draft);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || `Invalid ${section} draft` },
          { status: 422 }
        );
      }
      parsedDrafts.push({
        section,
        data: parsed.data as ContentMap[ContentSection],
      });
    }

    let validatedPageConfig = null;
    if (pageConfigDraft) {
      const parsed = await parseAndValidatePageConfig(tenant, pageConfigDraft);
      if ("error" in parsed) {
        return NextResponse.json({ error: parsed.error }, { status: 422 });
      }
      validatedPageConfig = parsed.pageConfig;
    }

    const publishedSections: string[] = [];
    for (const draft of parsedDrafts) {
      const current = await getContent(draft.section, tenant) as unknown as Record<string, unknown>;
      const next = draft.data as ContentMap[typeof draft.section];
      const changes = diffFields(current, next as unknown as Record<string, unknown>);

      await setContent(draft.section, next, tenant);
      await appendVersion(draft.section, next, actor.isImpersonating ? "admin" : "user", tenant, changes);
      await recordSectionUpdate(draft.section, tenant);
      await logActivity({
        text: actor.isImpersonating
          ? `Scaffold admin published ${draft.section}`
          : `Published ${draft.section} from site editor`,
        time: new Date().toISOString(),
        type: "admin",
        section: draft.section,
        actor: actor.isImpersonating ? "admin" : "user",
        changes,
        snapshot: current,
      }, tenant);
      await clearDraft(draft.section, tenant);
      publishedSections.push(draft.section);
    }

    let publishedPageConfig = false;
    if (validatedPageConfig) {
      await setPageConfig(validatedPageConfig, tenant);
      await clearDraftPageConfig(tenant);
      publishedPageConfig = true;
      if (actor.isImpersonating) {
        await logAuditEvent({
          tenant,
          actor,
          action: "page_config.published",
          targetType: "page_config",
          targetId: tenant,
          metadata: { pages: Object.keys(validatedPageConfig) },
        });
      }
    }

    revalidatePath("/");
    revalidateClientSite(tenant, ["/"]).catch((err) => {
      console.error("[publish POST] Failed to revalidate client site:", err);
    });

    return NextResponse.json({
      success: true,
      publishedSections,
      publishedPageConfig,
    });
  } catch (err) {
    console.error("[publish POST]", err);
    return NextResponse.json({ error: "Failed to publish changes" }, { status: 500 });
  }
}

export async function DELETE() {
  const authed = await verifyAuth();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const tenant = await requireTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;
    const permissionDenied = await requireTenantPermission(tenant, "content:write");
    if (permissionDenied) return permissionDenied;

    const [contentDrafts, pageConfigDraft, actor] = await Promise.all([
      listDrafts(tenant),
      getDraftPageConfig(tenant),
      getActorContext(tenant),
    ]);

    const discardedSections = Object.keys(contentDrafts) as ContentSection[];
    await Promise.all(discardedSections.map((section) => clearDraft(section, tenant)));
    if (pageConfigDraft) {
      await clearDraftPageConfig(tenant);
    }

    if (discardedSections.length > 0 || pageConfigDraft) {
      await logAuditEvent({
        tenant,
        actor,
        action: "site_editor.drafts_discarded",
        targetType: "site_editor",
        targetId: tenant,
        metadata: {
          sections: discardedSections,
          pageConfig: Boolean(pageConfigDraft),
        },
      });
    }

    revalidatePath("/");

    return NextResponse.json({
      success: true,
      discardedSections,
      discardedPageConfig: Boolean(pageConfigDraft),
    });
  } catch (err) {
    console.error("[publish DELETE]", err);
    return NextResponse.json({ error: "Failed to discard drafts" }, { status: 500 });
  }
}
