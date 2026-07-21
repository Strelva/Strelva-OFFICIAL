import { getAllTenants, isActiveTenant } from "@/lib/tenants";
import { listDrafts, getDraftContent, getContent } from "@/lib/storage";
import type { ContentSection } from "@/lib/types";
import { generatePreviewDiffs, type PreviewDiff } from "@/lib/agent-risk";
import { DraftActions } from "./DraftActions";

export const dynamic = "force-dynamic";

interface DraftItem {
  tenantId: string;
  tenantName: string;
  section: string;
  data: Record<string, unknown>;
  diffs: PreviewDiff[];
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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-display text-[26px] sm:text-[30px] font-medium tracking-[-0.02em] text-warm-white">Pending drafts</h1>
        <p className="text-sm text-gray-muted mt-1">
          Review AI-generated content changes before they go live
        </p>
      </div>

      {allDrafts.length === 0 ? (
        <div className="rounded-2xl border border-glass-border bg-glass p-12 text-center">
          <p className="text-gray-muted">No pending drafts across any clients.</p>
          <p className="text-xs text-gray-faint mt-2">
            Drafts appear here when the AI agent proposes content changes.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {allDrafts.map((draft) => (
            <div
              key={`${draft.tenantId}-${draft.section}`}
              className="rounded-2xl border border-glass-border bg-glass p-6"
            >
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-warm-white">
                    {draft.tenantName}
                  </span>
                  <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-bg text-warm-white">
                    {draft.section}
                  </span>
                  {typeof draft.data._updatedAt === "string" && (
                    <span className="text-[11px] text-gray-faint ml-auto">
                      {new Date(draft.data._updatedAt as string).toLocaleString()}
                    </span>
                  )}
                </div>
                <DraftActions
                  tenant={draft.tenantId}
                  section={draft.section}
                  preview={{
                    type: "content_update",
                    metadata: { ...draft.data, diffs: draft.diffs },
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
