import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getActorContext, isSuperAdmin } from "@/lib/auth";
import { getAllTenants, isActiveTenant, getTenantConfig } from "@/lib/tenants";
import { sendUpdateLiveEmail } from "@/lib/delivery-email";
import { SECTION_LABELS } from "@/components/ui/section-labels";
import { ROOT_DOMAIN } from "@/lib/brand";
import {
  listDrafts,
  getDraftContent,
  getContent,
  setContent,
  clearDraft,
  appendVersion,
  recordSectionUpdate,
  logActivity,
  logAuditEvent,
} from "@/lib/storage";
import type { ContentSection, ContentMap } from "@/lib/types";
import { sectionSchemas } from "@/lib/schemas";
import { diffFields } from "@/lib/utils";
import { revalidateClientSite } from "@/lib/revalidate-client";
import { readJsonObject } from "@/lib/request-body";
import { clientRevalidationTargetForSections } from "@/lib/content-revalidation";

export async function GET() {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const TENANTS = (await getAllTenants()).filter(isActiveTenant);
  const allDrafts: { tenant: string; section: string; data: unknown }[] = [];

  await Promise.all(
    TENANTS.map(async (t) => {
      try {
        const draftsMap = await listDrafts(t.id);
        const sections = Object.keys(draftsMap);

        await Promise.all(
          sections.map(async (section) => {
            const data = await getDraftContent(
              section as ContentSection,
              t.id
            );
            if (data) {
              allDrafts.push({ tenant: t.id, section, data });
            }
          })
        );
      } catch {
        // Skip tenants where draft fetch fails
      }
    })
  );

  return NextResponse.json(allDrafts);
}

export async function POST(request: Request) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const actor = await getActorContext();

  const body = await readJsonObject(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const tenant = typeof body.tenant === "string" ? body.tenant : "";
  const section = typeof body.section === "string" ? body.section : "";
  const action = body.action === "approve" || body.action === "reject" ? body.action : undefined;

  if (!tenant || !section || !action) {
    return NextResponse.json(
      { error: "Missing or invalid fields: tenant, section, action" },
      { status: 400 }
    );
  }

  // Verify tenant exists
  const tenants = (await getAllTenants()).filter(isActiveTenant);
  if (!tenants.find((t) => t.id === tenant)) {
    return NextResponse.json({ error: "Unknown tenant" }, { status: 404 });
  }

  const typedSection = section as ContentSection;
  if (!sectionSchemas[typedSection]) {
    return NextResponse.json({ error: "Unknown section" }, { status: 400 });
  }

  if (action === "approve") {
    const draftData = await getDraftContent(typedSection, tenant);
    if (!draftData) {
      return NextResponse.json(
        { error: "No draft found for this section" },
        { status: 404 }
      );
    }
    const parsed = sectionSchemas[typedSection].safeParse(draftData);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid draft content" },
        { status: 422 }
      );
    }

    const current = await getContent(typedSection, tenant) as unknown as Record<string, unknown>;
    const changes = diffFields(current, parsed.data as Record<string, unknown>);
    await setContent(typedSection, parsed.data as ContentMap[typeof typedSection], tenant);
    await appendVersion(typedSection, parsed.data, "admin", tenant, changes);
    await recordSectionUpdate(typedSection, tenant);
    await logActivity({
      text: `Scaffold admin approved AI draft for ${typedSection}`,
      time: new Date().toISOString(),
      type: "admin",
      section: typedSection,
      actor: "admin",
      changes,
      snapshot: current,
    }, tenant);
    await logAuditEvent({
      tenant,
      actor,
      action: "draft.approved",
      targetType: "content_section",
      targetId: typedSection,
      metadata: { section: typedSection, changeCount: changes.length },
    });
    await clearDraft(typedSection, tenant);
    revalidatePath("/");

    // Await revalidation so we know whether the change actually reached the live
    // client site BEFORE we tell the owner "it's live". A failed revalidation
    // means the published content is sitting in the control plane but the client
    // repo may still be serving the old copy — so we soften the email and ping
    // Jacob instead of silently swallowing the failure. Revalidation/email
    // problems must never fail a publish that already succeeded above.
    let revalidationFailed = false;
    try {
      const result = await revalidateClientSite(
        tenant,
        clientRevalidationTargetForSections([typedSection])
      );
      // `skipped` = no client site configured, so nothing to roll out to and
      // "live" is the honest claim. Only a real failure softens the message.
      revalidationFailed = !result.success && !result.skipped;
      if (revalidationFailed) {
        console.error(
          `[admin/drafts] Revalidation failed for ${tenant}/${typedSection}: ${result.error ?? "unknown error"}`
        );
        if (process.env.SLACK_WEBHOOK_URL) {
          await fetch(process.env.SLACK_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: `⚠️ Revalidation failed for *${tenant}* (${typedSection}) after approving a draft — the change is published in the control plane but may not be live on the client site yet. Error: ${result.error ?? "unknown"}`,
            }),
          }).catch(() => {});
        }
      }
    } catch (err) {
      revalidationFailed = true;
      console.error("[admin/drafts] Revalidation threw:", err);
    }

    // Close the abdication loop: tell the owner, in plain English, that their
    // update is live (or rolling out, if revalidation didn't confirm). Fail
    // soft — a notification problem must never block a publish that already
    // succeeded above.
    try {
      const tenantConfig = await getTenantConfig(tenant);
      const ownerEmail = tenantConfig?.ownerEmail;
      if (ownerEmail) {
        const siteName = tenantConfig?.siteName || tenant;
        const sectionLabel = SECTION_LABELS[typedSection] || typedSection;
        const whatChanged = `your ${sectionLabel.toLowerCase()}`;
        const domain = tenantConfig?.productionDomain || `${tenant}.${ROOT_DOMAIN}`;
        const siteUrl =
          tenantConfig?.siteUrl ||
          (domain.startsWith("http") ? domain : `https://${domain}`);
        await sendUpdateLiveEmail({
          email: ownerEmail,
          siteName,
          whatChanged,
          siteUrl,
          rollingOut: revalidationFailed,
          logPrefix: "[admin/drafts]",
        });
      }
    } catch (err) {
      console.error("[admin/drafts] Owner update-live email failed:", err);
    }
  } else {
    await clearDraft(typedSection, tenant);
    await logAuditEvent({
      tenant,
      actor,
      action: "draft.rejected",
      targetType: "content_section",
      targetId: typedSection,
      metadata: { section: typedSection },
    });
  }

  return NextResponse.json({ ok: true, action, tenant, section });
}
