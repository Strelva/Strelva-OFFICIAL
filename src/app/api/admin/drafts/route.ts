import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isSuperAdmin } from "@/lib/auth";
import { TENANTS } from "@/lib/tenants";
import {
  listDrafts,
  getDraftContent,
  setContent,
  clearDraft,
} from "@/lib/storage";
import type { ContentSection, ContentMap } from "@/lib/types";

export async function GET() {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
  if (!TENANTS.find((t) => t.id === tenant)) {
    return NextResponse.json({ error: "Unknown tenant" }, { status: 404 });
  }

  const typedSection = section as ContentSection;

  if (action === "approve") {
    const draftData = await getDraftContent(typedSection, tenant);
    if (!draftData) {
      return NextResponse.json(
        { error: "No draft found for this section" },
        { status: 404 }
      );
    }
    await setContent(typedSection, draftData as ContentMap[typeof typedSection], tenant);
    await clearDraft(typedSection, tenant);
    revalidatePath("/");
  } else {
    await clearDraft(typedSection, tenant);
  }

  return NextResponse.json({ ok: true, action, tenant, section });
}
