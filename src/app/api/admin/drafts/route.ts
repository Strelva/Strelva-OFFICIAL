import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getActorContext, isSuperAdmin } from "@/lib/auth";
import { getAllTenants } from "@/lib/tenants";
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

export async function GET() {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const TENANTS = await getAllTenants();
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

  const body = await request.json();
  const { tenant, section, action } = body as {
    tenant: string;
    section: string;
    action: "approve" | "reject";
  };

  if (!tenant || !section || !["approve", "reject"].includes(action)) {
    return NextResponse.json(
      { error: "Missing or invalid fields: tenant, section, action" },
      { status: 400 }
    );
  }

  // Verify tenant exists
  const tenants = await getAllTenants();
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
    revalidateClientSite(tenant, ["/"]).catch(() => {});
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
