import { NextResponse } from "next/server";
import type { ContentMap, ContentSection } from "@/lib/types";
import { getContent } from "@/lib/storage";
import { getTenantConfig } from "@/lib/tenants";
import { getTemplateForTenant } from "@/components/templates/registry";

async function isValidSection(section: string, tenant: string): Promise<boolean> {
  const template = await getTemplateForTenant(tenant);
  return template.contentSections.includes(section as ContentSection);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tenant: string; section: string }> }
) {
  const { tenant, section } = await params;

  if (!/^[a-z0-9-]+$/.test(tenant)) {
    return NextResponse.json({ error: "Invalid tenant" }, { status: 400 });
  }

  try {
    const config = await getTenantConfig(tenant);
    if (!config || config.active === false) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    if (!(await isValidSection(section, tenant))) {
      return NextResponse.json({ error: "Invalid section" }, { status: 400 });
    }

    const data = await getContent(section as ContentSection, tenant);
    return NextResponse.json(data as ContentMap[ContentSection]);
  } catch (err) {
    console.error("[public content GET]", tenant, section, err);
    return NextResponse.json({ error: "Failed to load content" }, { status: 500 });
  }
}
