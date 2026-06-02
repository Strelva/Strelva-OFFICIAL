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
        <h1 className="text-2xl font-semibold text-warm-white">Pending Drafts</h1>
        <p className="text-sm text-gray-muted mt-1">
          Review AI-generated content changes before they go live
        </p>
      </div>

      {allDrafts.length === 0 ? (
        <div className="rounded-xl bg-glass border border-glass-border p-12 text-center">
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
              className="rounded-xl bg-glass border border-glass-border p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-sm font-medium text-warm-white">
                      {draft.tenantName}
                    </span>
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-bg text-warm-white">
                      {draft.section}
                    </span>
                  </div>
                  <div className="rounded-lg bg-surface-base p-4 overflow-y-auto max-h-64 space-y-3">
                    <div className="flex items-center gap-2 border-b border-glass-border pb-2 mb-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-warm-white">{draft.section}</span>
                      {typeof draft.data._updatedAt === "string" && (
                        <span className="text-[10px] text-gray-faint">{new Date(draft.data._updatedAt as string).toLocaleString()}</span>
                      )}
                    </div>
                    {Object.entries(draft.data)
                      .filter(([key]) => !key.startsWith("_"))
                      .map(([key, value]) => (
                        <div key={key} className="flex flex-col gap-0.5">
                          <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-gray-muted">{key}</span>
                          <span className="text-xs text-warm-white break-words">
                            {typeof value === "string"
                              ? value.length > 200 ? `${value.slice(0, 200)}...` : value
                              : Array.isArray(value)
                                ? `${value.length} item${value.length === 1 ? "" : "s"}`
                                : value && typeof value === "object"
                                  ? Object.keys(value as Record<string, unknown>).slice(0, 4).join(", ") + (Object.keys(value as Record<string, unknown>).length > 4 ? " ..." : "")
                                  : String(value)}
                          </span>
                        </div>
                      ))}
                  </div>
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
