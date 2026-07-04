"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CrmStage, TenantCrm } from "@/lib/tenant-crm";

interface ClientRow {
  id: string;
  siteName: string;
  ownerEmail: string | null;
  ownerName: string | null;
  active: boolean;
}

const STAGES: { value: CrmStage; label: string; dot: string }[] = [
  { value: "lead", label: "Lead", dot: "bg-sky-400" },
  { value: "building", label: "Building", dot: "bg-amber-400" },
  { value: "live", label: "Live", dot: "bg-emerald-400" },
  { value: "at_risk", label: "At risk", dot: "bg-orange-400" },
  { value: "churned", label: "Churned", dot: "bg-gray-faint" },
];

const STAGE_BY_VALUE = new Map(STAGES.map((s) => [s.value, s]));

// Deterministic, Tailwind-static chip palette (dynamic class names don't survive
// Tailwind's build-time scan, so we pick from a fixed list by string hash).
const TAG_PALETTE = [
  "bg-sky-500/15 text-sky-300",
  "bg-emerald-500/15 text-emerald-300",
  "bg-amber-500/15 text-amber-300",
  "bg-violet-500/15 text-violet-300",
  "bg-rose-500/15 text-rose-300",
  "bg-teal-500/15 text-teal-300",
];

function tagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) | 0;
  return TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length];
}

function emptyCrm(tenantId: string): TenantCrm {
  return { tenantId, tags: [], stage: null, notes: [], updatedAt: null };
}

function formatUpdated(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return d.toLocaleDateString();
}

export function ClientsCrm({
  clients,
  initialCrm,
}: {
  clients: ClientRow[];
  initialCrm: Record<string, TenantCrm>;
}) {
  const [crm, setCrm] = useState<Record<string, TenantCrm>>(initialCrm);
  const [stageFilter, setStageFilter] = useState<CrmStage | "all">("all");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tagDraft, setTagDraft] = useState<Record<string, string>>({});
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});

  const getCrm = (id: string): TenantCrm => crm[id] ?? emptyCrm(id);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const id of Object.keys(crm)) getCrm(id).tags.forEach((t) => set.add(t));
    for (const c of clients) getCrm(c.id).tags.forEach((t) => set.add(t));
    return [...set].sort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crm, clients]);

  const visible = clients.filter((c) => {
    const rec = getCrm(c.id);
    if (stageFilter !== "all" && rec.stage !== stageFilter) return false;
    if (tagFilter && !rec.tags.includes(tagFilter)) return false;
    return true;
  });

  async function write(
    id: string,
    body: { tags?: string[]; stage?: CrmStage; note?: string }
  ) {
    setSaving((s) => ({ ...s, [id]: true }));
    setErrors((e) => ({ ...e, [id]: "" }));
    try {
      const res = await fetch(`/api/admin/tenants/${id}/crm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setCrm((prev) => ({ ...prev, [id]: data.crm as TenantCrm }));
    } catch (err) {
      setErrors((e) => ({
        ...e,
        [id]: err instanceof Error ? err.message : "Save failed",
      }));
    } finally {
      setSaving((s) => ({ ...s, [id]: false }));
    }
  }

  function addTag(id: string) {
    const raw = (tagDraft[id] ?? "").trim();
    if (!raw) return;
    const current = getCrm(id).tags;
    if (current.includes(raw)) {
      setTagDraft((d) => ({ ...d, [id]: "" }));
      return;
    }
    setTagDraft((d) => ({ ...d, [id]: "" }));
    void write(id, { tags: [...current, raw] });
  }

  function removeTag(id: string, tag: string) {
    void write(id, { tags: getCrm(id).tags.filter((t) => t !== tag) });
  }

  function addNote(id: string) {
    const text = (noteDraft[id] ?? "").trim();
    if (!text) return;
    setNoteDraft((d) => ({ ...d, [id]: "" }));
    void write(id, { note: text });
  }

  const filtersActive = stageFilter !== "all" || tagFilter !== null;

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-glass border border-glass-border px-4 py-3">
        <label className="flex items-center gap-2 text-xs text-gray-muted">
          Stage
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value as CrmStage | "all")}
            className="rounded-md bg-gray-bg border border-glass-border px-2 py-1 text-xs text-warm-white focus:outline-none focus:border-accent/50"
          >
            <option value="all">All</option>
            {STAGES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-gray-muted">Tags</span>
            {allTags.map((tag) => {
              const active = tagFilter === tag;
              return (
                <button
                  key={tag}
                  onClick={() => setTagFilter(active ? null : tag)}
                  className={`rounded-full px-2 py-0.5 text-[11px] transition-opacity ${tagColor(
                    tag
                  )} ${active ? "ring-1 ring-warm-white/40" : "opacity-70 hover:opacity-100"}`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        )}

        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-gray-faint">
            {visible.length} of {clients.length}
          </span>
          {filtersActive && (
            <button
              onClick={() => {
                setStageFilter("all");
                setTagFilter(null);
              }}
              className="text-xs text-gray-muted hover:text-warm-white transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Client list */}
      {visible.length === 0 ? (
        <div className="rounded-xl bg-glass border border-glass-border p-10 text-center">
          <p className="text-sm font-medium text-warm-white">No clients match</p>
          <p className="mt-1 text-xs text-gray-muted">
            {filtersActive
              ? "Clear the filters to see everyone."
              : "Clients appear here once tenants exist."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((c) => {
            const rec = getCrm(c.id);
            const stage = rec.stage ? STAGE_BY_VALUE.get(rec.stage) : null;
            const isOpen = expanded === c.id;
            const busy = saving[c.id];
            return (
              <div
                key={c.id}
                className="rounded-xl bg-glass border border-glass-border overflow-hidden"
              >
                <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
                  {/* Identity + tags */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-warm-white truncate">
                        {c.siteName}
                      </span>
                      {!c.active && (
                        <span className="text-[10px] uppercase tracking-wide text-gray-faint border border-glass-border rounded px-1 py-0.5">
                          Archived
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-gray-muted truncate">
                      {c.ownerEmail || c.ownerName || (
                        <span className="text-gray-faint">no contact on file</span>
                      )}
                    </p>

                    {/* Tags */}
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      {rec.tags.map((tag) => (
                        <span
                          key={tag}
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${tagColor(
                            tag
                          )}`}
                        >
                          <button
                            onClick={() => setTagFilter(tag)}
                            className="hover:underline"
                            title={`Filter by ${tag}`}
                          >
                            {tag}
                          </button>
                          <button
                            onClick={() => removeTag(c.id, tag)}
                            className="opacity-60 hover:opacity-100"
                            title="Remove tag"
                            aria-label={`Remove ${tag}`}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      <input
                        value={tagDraft[c.id] ?? ""}
                        onChange={(e) =>
                          setTagDraft((d) => ({ ...d, [c.id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addTag(c.id);
                          }
                        }}
                        placeholder="+ tag"
                        className="w-20 rounded-full bg-gray-bg border border-glass-border px-2 py-0.5 text-[11px] text-warm-white placeholder:text-gray-faint focus:outline-none focus:border-accent/50 focus:w-28 transition-all"
                      />
                    </div>
                  </div>

                  {/* Stage + actions */}
                  <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                    <div className="flex items-center gap-2">
                      {stage && (
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${stage.dot}`}
                          aria-hidden
                        />
                      )}
                      <select
                        value={rec.stage ?? ""}
                        disabled={busy}
                        onChange={(e) =>
                          write(c.id, { stage: e.target.value as CrmStage })
                        }
                        className="rounded-md bg-gray-bg border border-glass-border px-2 py-1 text-xs text-warm-white focus:outline-none focus:border-accent/50 disabled:opacity-40"
                      >
                        <option value="" disabled>
                          Set stage…
                        </option>
                        {STAGES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Link
                        href={`/dashboard?tenant=${c.id}`}
                        className="text-accent hover:underline"
                      >
                        Open dashboard →
                      </Link>
                      <span className="text-gray-faint">·</span>
                      <button
                        onClick={() => setExpanded(isOpen ? null : c.id)}
                        className="text-gray-muted hover:text-warm-white transition-colors"
                        aria-expanded={isOpen}
                      >
                        Notes ({rec.notes.length})
                      </button>
                    </div>
                    <span className="text-[11px] text-gray-faint">
                      updated {formatUpdated(rec.updatedAt)}
                    </span>
                  </div>
                </div>

                {errors[c.id] && (
                  <div className="px-4 pb-2 -mt-2">
                    <p className="text-xs text-rose-400" role="alert">
                      {errors[c.id]}
                    </p>
                  </div>
                )}

                {/* Notes drawer */}
                {isOpen && (
                  <div className="border-t border-glass-border bg-gray-bg/40 p-4 space-y-3">
                    <div className="flex items-start gap-2">
                      <textarea
                        value={noteDraft[c.id] ?? ""}
                        onChange={(e) =>
                          setNoteDraft((d) => ({ ...d, [c.id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            addNote(c.id);
                          }
                        }}
                        placeholder="Add a note… (⌘↵ to save)"
                        rows={2}
                        className="flex-1 rounded-md bg-surface-base border border-glass-border px-3 py-2 text-sm text-warm-white placeholder:text-gray-faint focus:outline-none focus:border-accent/50 resize-y"
                      />
                      <button
                        onClick={() => addNote(c.id)}
                        disabled={busy || !(noteDraft[c.id] ?? "").trim()}
                        className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-40"
                      >
                        Add
                      </button>
                    </div>
                    {rec.notes.length === 0 ? (
                      <p className="text-xs text-gray-faint">No notes yet.</p>
                    ) : (
                      <ul className="space-y-2">
                        {[...rec.notes]
                          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                          .map((n) => (
                            <li
                              key={n.id}
                              className="rounded-md bg-surface-base border border-glass-border px-3 py-2"
                            >
                              <p className="text-sm text-warm-white whitespace-pre-wrap">
                                {n.text}
                              </p>
                              <p className="mt-1 text-[11px] text-gray-faint">
                                {n.author} · {formatUpdated(n.createdAt)}
                              </p>
                            </li>
                          ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
