import { authorizeAdminOperatorRead } from "@/platform/operator-read-audit/admission";
import { getAllTenants, isActiveTenant } from "@/lib/tenants";
import { listDrafts, getDraftContent, getContent } from "@/lib/storage";
import type { ContentSection } from "@/lib/types";
import { generatePreviewDiffs } from "@/lib/agent-risk";
import { DraftsView } from "./DraftsView";
import type { DraftItem } from "./DraftsView";

export const dynamic = "force-dynamic";

export default async function AdminDraftsPage() {
  await authorizeAdminOperatorRead("admin.drafts.read");
  const TENANTS = (await getAllTenants()).filter(isActiveTenant);
  const allDrafts: DraftItem[] = [];

  await Promise.all(
    TENANTS.map(async (t) => {
      try {
        const draftsMap = await listDrafts(t.id);
        const sections = Object.keys(draftsMap);

        await Promise.all(
          sections.map(async (section) => {
            const [data, current] = await Promise.all([
              getDraftContent(section as ContentSection, t.id),
              getContent(section as ContentSection, t.id).catch(() => null),
            ]);
            if (data) {
              const draftRecord = data as unknown as Record<string, unknown>;
              const currentRecord = (current ?? {}) as unknown as Record<string, unknown>;
              allDrafts.push({
                tenantId: t.id,
                tenantName: t.siteName,
                section,
                data: draftRecord,
                diffs: generatePreviewDiffs(currentRecord, draftRecord),
              });
            }
          })
        );
      } catch {
        // Skip tenants where draft fetch fails
      }
    })
  );

  return <DraftsView drafts={allDrafts} />;
}
