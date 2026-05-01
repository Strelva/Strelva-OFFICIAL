import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import type { ContentMap, ContentSection } from "@/lib/types";
import {
  getContent,
  setContent,
  recordSectionUpdate,
  logActivity,
  getDraftContent,
  setDraftContent,
  clearDraft,
  appendVersion,
} from "@/lib/storage";
import { diffFields } from "@/lib/utils";
import { getTenantFromHeaders, requireTenantFromHeaders } from "@/lib/tenant";
import { getTemplateForTenant } from "@/components/templates/registry";
import { requireTenantAccess } from "@/lib/auth";
import { requireActiveSubscription } from "@/lib/subscription";
import { revalidateClientSite } from "@/lib/revalidate-client";
import { sectionSchemas } from "@/lib/schemas";

async function isValidSection(section: string, tenant: string): Promise<boolean> {
  const template = await getTemplateForTenant(tenant);
  return template.contentSections.includes(section as ContentSection);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ section: string }> }
) {
  const { section } = await params;

  try {
    const tenant = await getTenantFromHeaders();

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
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;
    const blocked = await requireActiveSubscription(tenant);
    if (blocked) return blocked;

    if (!(await isValidSection(section, tenant))) {
      return NextResponse.json({ error: "Invalid section" }, { status: 400 });
    }
    const s = section as ContentSection;

    const body = await request.json();
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
      return NextResponse.json({ success: true, draft: true });
    }

    const current = await getContent(s, tenant) as unknown as Record<string, unknown>;
    const changes = diffFields(current, parsed.data as Record<string, unknown>);

    await setContent(s, parsed.data as ContentMap[typeof s], tenant);
    await appendVersion(s, parsed.data, "user", tenant, changes);
    await recordSectionUpdate(s, tenant);
    await logActivity({
      text: `Updated ${s} via admin`,
      time: new Date().toISOString(),
      type: "admin",
      section: s,
      actor: "user",
      changes,
      snapshot: current,
    }, tenant);

    await clearDraft(s, tenant).catch(() => {});

    revalidatePath("/");

    // Trigger revalidation on standalone client site
    revalidateClientSite(tenant, ["/"]).catch((err) => {
      console.error("[content PUT] Failed to revalidate client site:", err);
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
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;
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
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "DELETE only supported for drafts" }, { status: 400 });
  } catch (err) {
    console.error("[content DELETE]", section, err);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
