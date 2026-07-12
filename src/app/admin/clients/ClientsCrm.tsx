"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import type { CrmStage, TenantCrm } from "@/lib/tenant-crm";
import type { LetterGrade } from "@/lib/status-colors";
import { ClientLogo, Chip, Grade, LaunchBar } from "../console";

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

type StageTone = "good" | "warn" | "crit" | "neutral" | "accent";
const STAGES: { value: CrmStage; label: string; tone: StageTone }[] = [
  { value: "lead", label: "Lead", tone: "accent" },
  { value: "building", label: "Building", tone: "warn" },
  { value: "live", label: "Live", tone: "good" },
  { value: "at_risk", label: "At risk", tone: "crit" },
  { value: "churned", label: "Churned", tone: "neutral" },
];
const STAGE_BY_VALUE = new Map(STAGES.map((s) => [s.value, s]));
const STAGE_ORDER = new Map(STAGES.map((s, i) => [s.value, i]));

function emptyCrm(tenantId: string): TenantCrm {
  return { tenantId, tags: [], stage: null, notes: [], contacts: [], activity: [], updatedAt: null };
}

function activeAgo(iso: string | null): string {
  if (!iso) return "no activity";
  const diffDay = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (diffDay <= 0) return "today";
  return `${diffDay}d ago`;
}

type SortKey = "active" | "stage" | "atrisk";
const SORTS: { value: SortKey; label: string }[] = [
  { value: "active", label: "Last active" },
  { value: "atrisk", label: "At risk first" },
  { value: "stage", label: "Stage" },
];

const selectClass =
  "rounded-[8px] border border-glass-border bg-glass px-2.5 py-[7px] text-[12px] text-warm-white focus:border-accent/50 focus:outline-none";

export function ClientsCrm({
  clients,
  initialCrm,
}: {
  clients: ClientRow[];
  initialCrm: Record<string, TenantCrm>;
}) {
  const [crm, setCrm] = useState<Record<string, TenantCrm>>(initialCrm);
  const [stageFilter, setStageFilter] = useState<CrmStage | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("active");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");

  const getCrm = (id: string): TenantCrm => crm[id] ?? emptyCrm(id);

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
    const q = query.trim().toLowerCase();
    const filtered = clients.filter((c) => {
      if (stageFilter !== "all" && getCrm(c.id).stage !== stageFilter) return false;
      if (q && !`${c.siteName} ${c.ownerName ?? ""} ${c.ownerEmail ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const activeMs = (c: ClientRow) => (c.lastActivity ? new Date(c.lastActivity).getTime() : 0);
    return filtered.sort((a, b) => {
      if (sortKey === "stage") {
        const sa = STAGE_ORDER.get(getCrm(a.id).stage ?? ("" as CrmStage)) ?? 99;
        const sb = STAGE_ORDER.get(getCrm(b.id).stage ?? ("" as CrmStage)) ?? 99;
        if (sa !== sb) return sa - sb;
      }
      if (sortKey === "atrisk") {
        const ra = a.atRiskReason ? 0 : 1;
        const rb = b.atRiskReason ? 0 : 1;
        if (ra !== rb) return ra - rb;
      }
      return activeMs(b) - activeMs(a);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, crm, stageFilter, sortKey, query]);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex min-w-[220px] flex-1 items-center gap-2.5 rounded-[10px] border border-glass-border bg-glass px-3">
          <Search className="h-[15px] w-[15px] shrink-0 text-gray-faint" strokeWidth={1.8} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clients…"
            className="w-full bg-transparent py-2.5 text-[12.5px] text-warm-white placeholder:text-gray-faint focus:outline-none"
          />
        </div>
        <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value as CrmStage | "all")} className={selectClass} aria-label="Filter by stage">
          <option value="all">All stages</option>
          {STAGES.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
        </select>
        <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className={selectClass} aria-label="Sort">
          {SORTS.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
        </select>
        <span className="ml-auto font-mono text-[11px] text-gray-faint tabular-nums">{visible.length} of {clients.length}</span>
      </div>

      {error && <p className="text-[12px] text-critical" role="alert">{error}</p>}

      {/* List */}
      {visible.length === 0 ? (
        <div className="rounded-2xl border border-glass-border bg-glass p-10 text-center">
          <p className="text-[14px] font-medium text-warm-white">No clients match</p>
          <p className="mt-1 text-[12px] text-gray-muted">{query || stageFilter !== "all" ? "Clear the filters to see everyone." : "Clients appear here once tenants exist."}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-glass-border bg-glass">
          <div className="hidden grid-cols-[1fr_auto_130px_auto] items-center gap-5 px-4 pb-1.5 pt-3 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-gray-faint md:grid">
            <span>Client</span><span className="w-[52px] text-center">Health</span><span>Launch</span><span className="w-[130px] text-right">Stage · active</span>
          </div>
          <div className="divide-y divide-glass-border">
            {visible.map((c) => {
              const rec = getCrm(c.id);
              const stage = rec.stage ? STAGE_BY_VALUE.get(rec.stage) : null;
              const busy = saving[c.id];
              return (
                <div key={c.id} className="relative grid grid-cols-[1fr_auto_130px_auto] items-center gap-5 px-4 py-3 transition-colors hover:bg-glass-active">
                  <Link href={`/admin/clients/${c.id}`} className="absolute inset-0 z-0" aria-label={`Open ${c.siteName}`} />

                  {/* Identity */}
                  <div className="pointer-events-none relative z-[1] flex min-w-0 items-center gap-3">
                    <ClientLogo name={c.siteName} size={34} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[13.5px] font-semibold tracking-[-0.01em] text-warm-white">{c.siteName}</span>
                        {c.atRiskReason && <Chip tone="crit">at risk</Chip>}
                        {!c.active && <Chip tone="neutral">archived</Chip>}
                      </div>
                      <p className="mt-0.5 truncate text-[11.5px] text-gray-muted">
                        {c.ownerEmail || c.ownerName || <span className="text-gray-faint">no contact on file</span>}
                      </p>
                    </div>
                  </div>

                  {/* Health grade */}
                  <div className="pointer-events-none relative z-[1] hidden w-[52px] justify-center md:flex">
                    {c.seoGrade ? <Grade grade={c.seoGrade} /> : <span className="text-[12px] text-gray-faint">–</span>}
                  </div>

                  {/* Launch */}
                  <div className="pointer-events-none relative z-[1] hidden md:block">
                    {c.launchScore != null ? (
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[11px] text-gray-muted"><span>Launch</span><span className="font-mono tabular-nums">{c.launchScore}%</span></div>
                        <LaunchBar pct={c.launchScore} />
                      </div>
                    ) : <span className="text-[12px] text-gray-faint">—</span>}
                  </div>

                  {/* Stage + active */}
                  <div className="relative z-[2] flex w-[130px] items-center justify-end gap-2.5">
                    <span className="pointer-events-none hidden whitespace-nowrap text-[11px] text-gray-faint lg:inline">{activeAgo(c.lastActivity)}</span>
                    <select
                      value={rec.stage ?? ""}
                      disabled={busy}
                      onChange={(e) => writeStage(c.id, e.target.value as CrmStage)}
                      onClick={(e) => e.stopPropagation()}
                      className={`pointer-events-auto shrink-0 rounded-[7px] border px-2 py-1 text-[11.5px] font-medium focus:outline-none disabled:opacity-40 ${stage ? "border-transparent" : "border-glass-border bg-glass text-gray-muted"}`}
                      style={stage ? undefined : undefined}
                      aria-label={`Stage for ${c.siteName}`}
                    >
                      <option value="" disabled>Stage…</option>
                      {STAGES.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
