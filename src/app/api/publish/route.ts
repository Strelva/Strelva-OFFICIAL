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
import { getActorContext, requireTenantAccess, requireTenantPermission, verifyAuth } from "@/platform/infra/auth";
import { requireActiveSubscription } from "@/lib/subscription";
import { getTemplateManifestForTenant } from "@/lib/template-manifests";
import { sectionSchemas } from "@/lib/schemas";
import { diffFields } from "@/lib/utils";
import { revalidateClientSite } from "@/lib/revalidate-client";
import { parseAndValidatePageConfig } from "@/lib/page-config-validation";
import { clientRevalidationTargetForSections } from "@/lib/content-revalidation";
import { releaseFlagMayBeOn } from "@/platform/release-flags/resolve";

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
    const permissionDenied = await requireTenantPermission(tenant, "content:write");
    if (permissionDenied) return permissionDenied;
    const blocked = await requireActiveSubscription(tenant);
    if (blocked) return blocked;

    const [template, contentDrafts, pageConfigDraft, actor] = await Promise.all([
      getTemplateManifestForTenant(tenant),
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

    const publishedSections: ContentSection[] = [];
    for (const draft of parsedDrafts) {
      const current = await getContent(draft.section, tenant) as unknown as Record<string, unknown>;
      const next = draft.data as ContentMap[typeof draft.section];
      const changes = diffFields(current, next as unknown as Record<string, unknown>);

      await setContent(draft.section, next, tenant);
      await appendVersion(draft.section, next, actor.isImpersonating ? "admin" : "user", tenant, changes);
      await recordSectionUpdate(draft.section, tenant);
      await logActivity({
        text: actor.isImpersonating
          ? `Strelva admin published ${draft.section}`
          : `Published ${draft.section} from site editor`,
        time: new Date().toISOString(),
        type: "admin",
        section: draft.section,
        actor: actor.isImpersonating ? "admin" : "user",
        changes,
        snapshot: current,
      }, tenant);
      await logAuditEvent({
        tenant,
        actor,
        action: "content.published",
        targetType: "content_section",
        targetId: draft.section,
        metadata: { section: draft.section, changeCount: changes.length },
      });
      await clearDraft(draft.section, tenant);
      publishedSections.push(draft.section);
    }

    let publishedPageConfig = false;
    if (validatedPageConfig) {
      await setPageConfig(validatedPageConfig, tenant);
      await clearDraftPageConfig(tenant);
      publishedPageConfig = true;
      await logAuditEvent({
        tenant,
        actor,
        action: "page_config.published",
        targetType: "page_config",
        targetId: tenant,
        metadata: { pages: Object.keys(validatedPageConfig) },
      });
    }

    revalidatePath("/");
    let liveSite:
      | { status: "revalidated" }
      | { status: "not_configured" }
      | { status: "failed"; error: string };
    try {
      const liveSiteResult = await revalidateClientSite(
        tenant,
        clientRevalidationTargetForSections(publishedSections, {
          pageConfigChanged: publishedPageConfig,
        })
      );
      liveSite = liveSiteResult.skipped
        ? { status: "not_configured" }
        : liveSiteResult.success
          ? { status: "revalidated" }
          : { status: "failed", error: liveSiteResult.error || "Unknown revalidation failure" };
    } catch (err) {
      const error = err instanceof Error ? err.message : "Unknown revalidation failure";
      console.error("[publish POST] Failed to revalidate client site:", err);
      liveSite = { status: "failed", error };
    }

    // Revalidation acceptance is distinct from observing the public homepage.
    // Keep the existing response and calls exactly when the new channel is off.
    let readBack: Record<string, unknown> | undefined;
    if (releaseFlagMayBeOn("systems") && releaseFlagMayBeOn("make_real_live:tenant_content")) {
      try {
        const [{ tenantReleaseFlagEnabled }, { currentReleaseViewer }] = await Promise.all([
          import("@/platform/release-flags/store"), import("@/platform/release-flags/viewer"),
        ]);
        const viewer = await currentReleaseViewer();
        if (await tenantReleaseFlagEnabled("systems", tenant, viewer) && await tenantReleaseFlagEnabled("make_real_live:tenant_content", tenant, viewer)) {
          const [{ getTenantConfig }, { readPublishedWebsiteContent }] = await Promise.all([
            import("@/lib/tenants"), import("@/products/websites/index"),
          ]);
          const config = await getTenantConfig(tenant);
          readBack = { ...await readPublishedWebsiteContent({
            tenant: config ?? {}, section: "website", expected: Object.fromEntries(parsedDrafts.map(draft => [draft.section, draft.data])),
          }) };
          // A failed read-back never makes accepted writes retryable.
          try {
            await logAuditEvent({ tenant, actor, action: "content.public_read_back", targetType: "website", targetId: tenant, metadata: readBack });
          } catch { /* The response still exposes the observation if audit storage fails. */ }
        }
      } catch {
        readBack = { ok: false, status: "unverified", detail: "The publish was accepted. Public read-back could not be confirmed; do not republish automatically." };
      }
    }

    return NextResponse.json({
      success: true,
      publishedSections,
      publishedPageConfig,
      liveSite,
      ...(readBack ? { readBack } : {}),
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
