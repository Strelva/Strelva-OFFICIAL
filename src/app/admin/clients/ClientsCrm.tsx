"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CrmStage, TenantCrm } from "@/lib/tenant-crm";
import {
  TONE_PILL,
  TONE_TEXT,
  gradeTone,
  launchTone,
  type LetterGrade,
} from "@/lib/status-colors";

export interface ClientRow {
  id: string;
  siteName: string;
  ownerEmail: string | null;
  ownerName: string | null;
  active: boolean;
  /** ISO of the owner's last activity, or null. */
  lastActivity: string | null;
  /** Top at-risk reason from getAtRiskTenants, or null if not at risk. */
  atRiskReason: string | null;
  /** Latest scan letter grade, or null if never scanned. */
  seoGrade: LetterGrade | null;
  /** Launch readiness percent (0-100), or null. */
  launchScore: number | null;
  /** Launch readiness verdict, or null. */
  launchStatus: "ready" | "watch" | "blocked" | null;
}

const STAGES: { value: CrmStage; label: string; dot: string }[] = [
  { value: "lead", label: "Lead", dot: "bg-sky-400" },
  { value: "building", label: "Building", dot: "bg-amber-400" },
  { value: "live", label: "Live", dot: "bg-emerald-400" },
  { value: "at_risk", label: "At risk", dot: "bg-orange-400" },
  { value: "churned", label: "Churned", dot: "bg-gray-faint" },
];

const STAGE_BY_VALUE = new Map(STAGES.map((s) => [s.value, s]));
const STAGE_ORDER = new Map(STAGES.map((s, i) => [s.value, i]));

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
  return {
    tenantId,
    tags: [],
    stage: null,
    notes: [],
    contacts: [],
    activity: [],
    updatedAt: null,
  };
}

function activeAgo(iso: string | null): string {
  if (!iso) return "no activity";
  const d = new Date(iso);
  const diffDay = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (diffDay <= 0) return "active today";
  if (diffDay === 1) return "active 1d ago";
  return `active ${diffDay}d ago`;
}

type SortKey = "active" | "stage" | "atrisk";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "active", label: "Last active" },
  { value: "stage", label: "Stage" },
  { value: "atrisk", label: "At risk first" },
];

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
  const [sortKey, setSortKey] = useState<SortKey>("active");
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string>("");

  const getCrm = (id: string): TenantCrm => crm[id] ?? emptyCrm(id);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const c of clients) getCrm(c.id).tags.forEach((t) => set.add(t));
    return [...set].sort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crm, clients]);

  async function writeStage(id: string, stage: CrmStage) {
    setSaving((s) => ({ ...s, [id]: true }));
    setError("");
    try {
      const res = await fetch(`/api/admin/tenants/${id}/crm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setCrm((prev) => ({ ...prev, [id]: data.crm as TenantCrm }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving((s) => ({ ...s, [id]: false }));
    }
  }

  const visible = useMemo(() => {
    const filtered = clients.filter((c) => {
      const rec = getCrm(c.id);
      if (stageFilter !== "all" && rec.stage !== stageFilter) return false;
      if (tagFilter && !rec.tags.includes(tagFilter)) return false;
      return true;
    });
    const activeMs = (c: ClientRow) => (c.lastActivity ? new Date(c.lastActivity).getTime() : 0);
    return filtered.sort((a, b) => {
      if (sortKey === "stage") {
        const sa = STAGE_ORDER.get(getCrm(a.id).stage ?? ("" as CrmStage)) ?? 99;
        const sb = STAGE_ORDER.get(getCrm(b.id).stage ?? ("" as CrmStage)) ?? 99;
        if (sa !== sb) return sa - sb;
        return activeMs(b) - activeMs(a);
      }
      if (sortKey === "atrisk") {
        const ra = a.atRiskReason ? 0 : 1;
        const rb = b.atRiskReason ? 0 : 1;
        if (ra !== rb) return ra - rb;
        return activeMs(b) - activeMs(a);
      }
      return activeMs(b) - activeMs(a);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, crm, stageFilter, tagFilter, sortKey]);

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
            className="rounded-md bg-surface-base border border-glass-border px-2 py-1 text-xs text-warm-white focus:outline-none focus:border-accent/50"
          >
            <option value="all">All</option>
            {STAGES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-xs text-gray-muted">
          Sort
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="rounded-md bg-surface-base border border-glass-border px-2 py-1 text-xs text-warm-white focus:outline-none focus:border-accent/50"
          >
            {SORTS.map((s) => (
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

      {error && (
        <p className="text-xs text-rose-400" role="alert">
          {error}
        </p>
      )}

      {/* Client list */}
      {visible.length === 0 ? (
        <div className="rounded-xl bg-glass border border-glass-border p-10 text-center">
          <p className="text-sm font-medium text-warm-white">No clients match</p>
          <p className="mt-1 text-xs text-gray-muted">
            {filtersActive ? "Clear the filters to see everyone." : "Clients appear here once tenants exist."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl bg-glass border border-glass-border divide-y divide-glass-border overflow-hidden">
          {visible.map((c) => {
            const rec = getCrm(c.id);
            const stage = rec.stage ? STAGE_BY_VALUE.get(rec.stage) : null;
            const busy = saving[c.id];
            return (
              <div key={c.id} className="relative flex items-center gap-4 px-4 py-3 hover:bg-gray-bg/60 transition-colors">
                {/* Whole-row link (sits under the interactive stage control) */}
                <Link
                  href={`/admin/clients/${c.id}`}
                  className="absolute inset-0 z-0"
                  aria-label={`Open ${c.siteName || c.ownerName || c.id}`}
                />

                {/* Identity */}
                <div className="pointer-events-none relative z-[1] min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-warm-white truncate">
                      {c.siteName || c.ownerName || c.id}
                    </span>
                    {!c.active && (
                      <span className="text-[10px] uppercase tracking-wide text-gray-faint border border-glass-border rounded px-1 py-0.5">
                        Archived
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-muted truncate">
                    {c.ownerEmail || c.ownerName || <span className="text-gray-faint">no contact on file</span>}
                  </p>
                </div>

                {/* Health-signal strip */}
                <div className="pointer-events-none relative z-[1] hidden items-center gap-2.5 text-[11px] md:flex">
                  {stage && (
                    <span className="inline-flex items-center gap-1 text-gray-muted">
                      <span className={`h-1.5 w-1.5 rounded-full ${stage.dot}`} aria-hidden />
                      {stage.label}
                    </span>
                  )}
                  {c.seoGrade && (
                    <span
                      className={`inline-flex rounded-full border px-1.5 py-0.5 font-medium ${TONE_PILL[gradeTone(c.seoGrade)]}`}
                      title="Latest site-health grade"
                    >
                      SEO {c.seoGrade}
                    </span>
                  )}
                  {c.launchStatus && c.launchScore != null && (
                    <span className={`font-medium ${TONE_TEXT[launchTone(c.launchStatus)]}`} title="Launch readiness">
                      {c.launchScore}%
                    </span>
                  )}
                  {c.atRiskReason && (
                    <span className="inline-flex items-center gap-1 text-rose-300" title={c.atRiskReason}>
                      <span className="h-1.5 w-1.5 rounded-full bg-red-400" aria-hidden />
                      at risk
                    </span>
                  )}
                  <span className="text-gray-faint whitespace-nowrap">{activeAgo(c.lastActivity)}</span>
                </div>

                {/* The one inline control: stage */}
                <select
                  value={rec.stage ?? ""}
                  disabled={busy}
                  onChange={(e) => writeStage(c.id, e.target.value as CrmStage)}
                  onClick={(e) => e.stopPropagation()}
                  className="pointer-events-auto relative z-[2] shrink-0 rounded-md bg-surface-base border border-glass-border px-2 py-1 text-xs text-warm-white focus:outline-none focus:border-accent/50 disabled:opacity-40"
                  aria-label={`Stage for ${c.siteName || c.id}`}
                >
                  <option value="" disabled>
                    Stage…
                  </option>
                  {STAGES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
