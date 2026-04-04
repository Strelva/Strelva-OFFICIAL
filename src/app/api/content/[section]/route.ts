import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import type { ContentSection } from "@/lib/types";
import {
  getContent,
  setContent,
  recordSectionUpdate,
  logActivity,
  getDraftContent,
  setDraftContent,
  clearDraft,
} from "@/lib/storage";
import { diffFields } from "@/lib/utils";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getTemplateForTenant } from "@/components/templates/registry";
import { requireTenantAccess } from "@/lib/auth";
import { requireActiveSubscription } from "@/lib/subscription";

async function isValidSection(section: string, tenant: string): Promise<boolean> {
  const template = await getTemplateForTenant(tenant);
  return template.contentSections.includes(section as ContentSection);
}

const REQUIRED_FIELDS: Partial<Record<ContentSection, string[]>> = {
  hero: ["headline", "tagline", "ctaText"],
  services: ["headline"],
  story: ["headline", "statement"],
  contact: ["email"],
  settings: ["siteName"],
  products: ["headline"],
};

function validateBody(section: ContentSection, body: Record<string, unknown>): string | null {
  const required = REQUIRED_FIELDS[section] ?? [];
  for (const field of required) {
    const value = body[field];
    if (typeof value !== "string" || value.trim() === "") {
      return `"${field}" is required and cannot be empty`;
    }
  }

  if (section === "contact" && typeof body.email === "string") {
    if (!body.email.includes("@") || !body.email.includes(".")) {
      return "Invalid email address";
    }
  }

  if (section === "services" && Array.isArray(body.services)) {
    for (let i = 0; i < body.services.length; i++) {
      const s = body.services[i] as Record<string, unknown>;
      if (typeof s.name !== "string" || s.name.trim() === "") {
        return `Service ${i + 1} is missing a name`;
      }
    }
  }

  if (section === "testimonials" && Array.isArray(body.testimonials)) {
    for (let i = 0; i < body.testimonials.length; i++) {
      const t = body.testimonials[i] as Record<string, unknown>;
      if (typeof t.quote !== "string" || t.quote.trim() === "") {
        return `Testimonial ${i + 1} is missing a quote`;
      }
    }
  }

  if (section === "events" && Array.isArray(body.events)) {
    for (let i = 0; i < body.events.length; i++) {
      const e = body.events[i] as Record<string, unknown>;
      if (typeof e.title !== "string" || e.title.trim() === "") {
        return `Event ${i + 1} is missing a title`;
      }
    }
  }

  if (section === "providers" && Array.isArray(body.providers)) {
    for (let i = 0; i < body.providers.length; i++) {
      const p = body.providers[i] as Record<string, unknown>;
      if (typeof p.name !== "string" || p.name.trim() === "") {
        return `Provider ${i + 1} is missing a name`;
      }
    }
  }

  if (section === "products" && Array.isArray(body.products)) {
    for (let i = 0; i < body.products.length; i++) {
      const p = body.products[i] as Record<string, unknown>;
      if (typeof p.name !== "string" || p.name.trim() === "") {
        return `Product ${i + 1} is missing a name`;
      }
      if (typeof p.price !== "string" || p.price.trim() === "") {
        return `Product ${i + 1} is missing a price`;
      }
    }
  }

  return null;
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
    const tenant = await getTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;
    const blocked = await requireActiveSubscription(tenant);
    if (blocked) return blocked;

    if (!(await isValidSection(section, tenant))) {
      return NextResponse.json({ error: "Invalid section" }, { status: 400 });
    }
    const s = section as ContentSection;

    const body = await request.json();

    const validationError = validateBody(s, body);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 422 });
    }

    const url = new URL(request.url);
    const isDraft = url.searchParams.get("draft") === "true";

    if (isDraft) {
      await setDraftContent(s, body, tenant);
      return NextResponse.json({ success: true, draft: true });
    }

    const current = await getContent(s, tenant) as unknown as Record<string, unknown>;
    const changes = diffFields(current, body);

    await setContent(s, body, tenant);
    await recordSectionUpdate(s, tenant);
    await logActivity({
      text: `Updated ${s} via admin`,
      time: new Date().toISOString(),
      type: "admin",
      section: s,
      actor: "user",
      changes,
    }, tenant);

    await clearDraft(s, tenant).catch(() => {});

    revalidatePath("/");

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
    const tenant = await getTenantFromHeaders();
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
