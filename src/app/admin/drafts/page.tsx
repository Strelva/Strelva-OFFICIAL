import { getAllTenants, isActiveTenant } from "@/lib/tenants";
import { listDrafts, getDraftContent } from "@/lib/storage";
import type { ContentSection } from "@/lib/types";
import { DraftActions } from "./DraftActions";

export const dynamic = "force-dynamic";

interface DraftItem {
  tenantId: string;
  tenantName: string;
  section: string;
  data: Record<string, unknown>;
}

export default async function AdminDraftsPage() {
  const TENANTS = (await getAllTenants()).filter(isActiveTenant);
  const allDrafts: DraftItem[] = [];

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
              allDrafts.push({
                tenantId: t.id,
                tenantName: t.siteName,
                section,
                data: data as unknown as Record<string, unknown>,
              });
            }
          })
        );
      } catch {
        // Skip tenants where draft fetch fails
      }
    })
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-white">Pending Drafts</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Review AI-generated content changes before they go live
        </p>
      </div>

      {allDrafts.length === 0 ? (
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-12 text-center">
          <p className="text-zinc-500">No pending drafts across any clients.</p>
          <p className="text-xs text-zinc-600 mt-2">
            Drafts appear here when the AI agent proposes content changes.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {allDrafts.map((draft) => (
            <div
              key={`${draft.tenantId}-${draft.section}`}
              className="rounded-xl bg-zinc-900 border border-zinc-800 p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-sm font-medium text-white">
                      {draft.tenantName}
                    </span>
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-700/40 text-zinc-300">
                      {draft.section}
                    </span>
                  </div>
                  <pre className="text-xs text-zinc-400 bg-zinc-950 rounded-lg p-4 overflow-x-auto max-h-64 overflow-y-auto">
                    {JSON.stringify(draft.data, null, 2)}
                  </pre>
                </div>
                <DraftActions
                  tenant={draft.tenantId}
                  section={draft.section}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
