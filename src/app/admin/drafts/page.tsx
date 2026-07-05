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
        <h1 className="font-[family-name:var(--font-display)] text-[28px] sm:text-[32px] font-medium text-warm-white">Pending Drafts</h1>
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
                        <span className="text-[11px] text-gray-faint">{new Date(draft.data._updatedAt as string).toLocaleString()}</span>
                      )}
                    </div>
                    {draft.diffs.length > 0 ? (
                      draft.diffs.map((d) => (
                        <div key={d.field} className="flex flex-col gap-0.5">
                          <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-gray-muted">
                            {d.field}
                            <span className="ml-1 text-gray-faint normal-case tracking-normal">({d.type})</span>
                          </span>
                          {d.type !== "added" && d.before && (
                            d.before.length > 200 ? (
                              <details className="group">
                                <summary className="cursor-pointer list-none text-xs text-red-300/80 line-through break-words marker:content-none">
                                  {d.before.slice(0, 200)}
                                  <span className="ml-1 no-underline text-gray-faint group-open:hidden">[show full]</span>
                                </summary>
                                <span className="text-xs text-red-300/80 line-through break-words">
                                  {d.before}
                                </span>
                              </details>
                            ) : (
                              <span className="text-xs text-red-300/80 line-through break-words">
                                {d.before}
                              </span>
                            )
                          )}
                          {d.type !== "removed" && d.after && (
                            d.after.length > 200 ? (
                              <details className="group">
                                <summary className="cursor-pointer list-none text-xs text-emerald-200 break-words marker:content-none">
                                  {d.after.slice(0, 200)}
                                  <span className="ml-1 text-gray-faint group-open:hidden">[show full]</span>
                                </summary>
                                <span className="text-xs text-emerald-200 break-words">
                                  {d.after}
                                </span>
                              </details>
                            ) : (
                              <span className="text-xs text-emerald-200 break-words">
                                {d.after}
                              </span>
                            )
                          )}
                        </div>
                      ))
                    ) : (
                      Object.entries(draft.data)
                        .filter(([key]) => !key.startsWith("_"))
                        .map(([key, value]) => (
                          <div key={key} className="flex flex-col gap-0.5">
                            <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-gray-muted">{key}</span>
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
                        ))
                    )}
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
