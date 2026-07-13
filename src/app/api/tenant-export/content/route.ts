import { NextResponse } from "next/server";
import { getTenantFromHeaders } from "@/lib/tenant";
import { requireTenantPermission, verifyAuth } from "@/lib/auth";
import { getContent, getPageConfig, SECTION_TO_TYPE } from "@/lib/storage";
import { getTenantConfig } from "@/lib/tenants";
import type { ContentSection } from "@/lib/types";

const CONTENT_SECTIONS = Object.keys(SECTION_TO_TYPE) as ContentSection[];

function jsonAttachment(body: unknown, filename: string) {
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export async function GET() {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenant = await getTenantFromHeaders();
  // "Leave with everything" is an owner action — a viewer/editor collaborator
  // should not be able to download the full content export.
  const blocked = await requireTenantPermission(tenant, "billing:manage");
  if (blocked) return blocked;

  const [tenantConfig, pageConfig, entries] = await Promise.all([
    getTenantConfig(tenant),
    getPageConfig(tenant).catch(() => null),
    Promise.all(
      CONTENT_SECTIONS.map(async (section) => {
        try {
          return [section, await getContent(section, tenant)] as const;
        } catch (error) {
          return [
            section,
            {
              exportError: error instanceof Error ? error.message : "Unable to export section",
            },
          ] as const;
        }
      }),
    ),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    tenant,
    siteName: tenantConfig?.siteName || tenant,
    ownerName: tenantConfig?.ownerName || "",
    template: tenantConfig?.template || "",
    content: Object.fromEntries(entries),
    pageConfig,
  };

  return jsonAttachment(payload, `${tenant}-content-export.json`);
}
