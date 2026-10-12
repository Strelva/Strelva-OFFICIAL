import { authorizeAdminOperatorRead } from "@/platform/operator-read-audit/admission";
import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/platform/infra/auth";
import { getAllTenants, isActiveTenant } from "@/lib/tenants";
import { listDrafts, getDraftContent } from "@/lib/storage";
import type { ContentSection } from "@/lib/types";

export async function GET() {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await authorizeAdminOperatorRead("admin.drafts.read");

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

/** Platform support may inspect drafts, but cannot author, approve or reject
 * client content. Ordinary agency/owner permissions own those decisions. */
export async function POST() {
  if (!(await isSuperAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ error: "Client content decisions belong to the business owner or its authorized agency.", code: "client_content_decision_required" }, { status: 410 });
}
