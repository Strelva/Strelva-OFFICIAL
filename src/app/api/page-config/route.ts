import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  clearDraftPageConfig,
  getDraftPageConfig,
  getPageConfig,
  logAuditEvent,
  setDraftPageConfig,
  setPageConfig,
} from "@/lib/storage";
import { requireTenantFromHeaders } from "@/lib/tenant";
import { getActorContext, verifyAuth, requireTenantAccess, requireTenantPermission } from "@/lib/auth";
import { requireActiveSubscription } from "@/lib/subscription";
import { readJsonObject } from "@/lib/request-body";
import { parseAndValidatePageConfig } from "@/lib/page-config-validation";
import { revalidateClientSite } from "@/lib/revalidate-client";
import { clientRevalidationTargetForSections } from "@/lib/content-revalidation";

export async function GET(request: Request) {
  try {
    // Authenticated dashboard read — gate on tenant access so one tenant's user
    // cannot read another tenant's page config or draft. The public storefront
    // reads page config via the separate tenant-in-path /api/v1/page-config route.
    const tenant = await requireTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;
    const url = new URL(request.url);
    const isDraft = url.searchParams.get("draft") === "true";
    const config = isDraft
      ? (await getDraftPageConfig(tenant)) || (await getPageConfig(tenant))
      : await getPageConfig(tenant);
    return NextResponse.json(config);
  } catch {
    return NextResponse.json({ error: "Failed to load page config" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const authed = await verifyAuth();
    if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenant = await requireTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;
    const permissionDenied = await requireTenantPermission(tenant, "content:write");
    if (permissionDenied) return permissionDenied;
    const blocked = await requireActiveSubscription(tenant);
    if (blocked) return blocked;
    const actor = await getActorContext(tenant);

    const body = await readJsonObject(request);
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const validated = await parseAndValidatePageConfig(tenant, body);
    if ("error" in validated) {
      return NextResponse.json({ error: validated.error }, { status: 422 });
    }
    const { pageConfig } = validated;

    const url = new URL(request.url);
    const isDraft = url.searchParams.get("draft") === "true";

    if (isDraft) {
      await setDraftPageConfig(pageConfig, tenant);
      if (actor.isImpersonating) {
        await logAuditEvent({
          tenant,
          actor,
          action: "page_config.draft_saved",
          targetType: "page_config",
          targetId: tenant,
          metadata: { pages: Object.keys(pageConfig) },
        });
      }
      return NextResponse.json({ success: true, draft: true });
    }

    await setPageConfig(pageConfig, tenant);
    await clearDraftPageConfig(tenant).catch(() => {});
    if (actor.isImpersonating) {
      await logAuditEvent({
        tenant,
        actor,
        action: "page_config.updated",
        targetType: "page_config",
        targetId: tenant,
        metadata: { pages: Object.keys(pageConfig) },
      });
    }
    revalidatePath("/");
    revalidateClientSite(
      tenant,
      clientRevalidationTargetForSections([], { pageConfigChanged: true })
    ).catch((err) => {
      console.error("[page-config PUT] Failed to revalidate client site:", err);
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to save page config" }, { status: 500 });
  }
}
