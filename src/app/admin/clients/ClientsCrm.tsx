"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import type { LetterGrade } from "@/lib/status-colors";
import { ClientLogo, Chip, Grade } from "../console";

export interface ClientRow {
  id: string;
  siteName: string;
  ownerEmail: string | null;
  ownerName: string | null;
  /** Public domain (bare host), or null if not on its own domain yet. Drives the favicon. */
  domain: string | null;
  active: boolean;
  /** Top at-risk reason from getAtRiskTenants, or null if not at risk. */
  atRiskReason: string | null;
  /** Latest scan letter grade, or null if never scanned. */
  seoGrade: LetterGrade | null;
  /** Managed-readiness verdict, or null. Only "blocked" is a real problem. */
  launchStatus: "ready" | "watch" | "blocked" | null;
  /** Human billing label, e.g. "Growth · $199/mo" / "Case study (free)" / "No plan set". */
  billingLabel: string;
  /** Whether billing is set up (tier/custom/case_study). false = "none". */
  billingConfigured: boolean;
}

type StatusTone = "good" | "warn" | "crit" | "neutral";

/** One clear verdict per client, absorbing active / at-risk / billing / readiness. */
function clientStatus(c: ClientRow): { label: string; tone: StatusTone; detail?: string } {
  if (!c.active) return { label: "Archived", tone: "neutral" };
  if (c.atRiskReason) return { label: "At risk", tone: "crit", detail: c.atRiskReason };
  // A live client with no plan is a real revenue leak (amber). But a client still
  // in onboarding without billing is the NORMAL state — show it as a calm neutral
  // "In build", not an amber warning on every pre-launch row.
  if (c.launchStatus === "ready" && !c.billingConfigured)
    return { label: "No plan", tone: "warn", detail: "Live but no billing — set a plan" };
  if (!c.billingConfigured || c.launchStatus === "blocked" || c.launchStatus === "watch")
    return { label: "In build", tone: "neutral", detail: "Still in onboarding" };
  return { label: "Live", tone: "good" };
}

const FILTERS = [
  { value: "all", label: "All" },
  { value: "live", label: "Live" },
  { value: "attention", label: "Needs attention" },
  { value: "archived", label: "Archived" },
] as const;
type FilterKey = (typeof FILTERS)[number]["value"];

const selectClass =
  "rounded-[8px] border border-glass-border bg-glass px-2.5 py-[7px] text-[12px] text-warm-white focus:border-accent/50 focus:outline-none";

function faviconUrl(domain: string | null): string | null {
  return domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64` : null;
}

export function ClientsCrm({ clients }: { clients: ClientRow[] }) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients
      .filter((c) => {
        const st = clientStatus(c);
        if (filter === "live" && st.label !== "Live") return false;
        if (filter === "archived" && c.active) return false;
        if (filter === "attention" && (st.tone === "good" || st.tone === "neutral")) return false;
        if (q && !`${c.siteName} ${c.domain ?? ""} ${c.ownerName ?? ""} ${c.ownerEmail ?? ""}`.toLowerCase().includes(q)) return false;
        return true;
      })
      // Attention first (crit, then warn), then live, then archived.
      .sort((a, b) => {
        const rank = (c: ClientRow) => {
          const t = clientStatus(c).tone;
          return t === "crit" ? 0 : t === "warn" ? 1 : t === "good" ? 2 : 3;
        };
        return rank(a) - rank(b) || a.siteName.localeCompare(b.siteName);
      });
  }, [clients, filter, query]);

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
        <select value={filter} onChange={(e) => setFilter(e.target.value as FilterKey)} className={selectClass} aria-label="Filter">
          {FILTERS.map((f) => (<option key={f.value} value={f.value}>{f.label}</option>))}
        </select>
        <span className="ml-auto font-mono text-[11px] text-gray-faint tabular-nums">{visible.length} of {clients.length}</span>
      </div>

      {/* List */}
      {visible.length === 0 ? (
        <div className="rounded-2xl border border-glass-border bg-glass p-10 text-center">
          <p className="text-[14px] font-medium text-warm-white">No clients match</p>
          <p className="mt-1 text-[12px] text-gray-muted">{query || filter !== "all" ? "Clear the filters to see everyone." : "Clients appear here once tenants exist."}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-glass-border bg-glass">
          <div className="hidden grid-cols-[1fr_52px_180px_120px] items-center gap-5 px-4 pb-1.5 pt-3 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-gray-faint md:grid">
            <span>Client</span>
            <span className="text-center">Health</span>
            <span>Billing</span>
            <span className="text-right">Status</span>
          </div>
          <div className="divide-y divide-glass-border">
            {visible.map((c) => {
              const st = clientStatus(c);
              const favicon = faviconUrl(c.domain);
              return (
                <div key={c.id} className="relative flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-glass-active md:grid md:grid-cols-[1fr_52px_180px_120px] md:gap-5">
                  <Link href={`/admin/clients/${c.id}`} className="absolute inset-0 z-0" aria-label={`Open ${c.siteName}`} />

                  {/* Identity — favicon + name + domain */}
                  <div className="pointer-events-none relative z-[1] flex min-w-0 flex-1 items-center gap-3">
                    <ClientLogo name={c.siteName} logoUrl={favicon} size={34} />
                    <div className="min-w-0">
                      <span className="block truncate text-[13.5px] font-semibold tracking-[-0.01em] text-warm-white">{c.siteName}</span>
                      <p className="mt-0.5 truncate text-[11.5px] text-gray-muted">
                        {c.domain || c.ownerEmail || <span className="text-gray-faint">no domain yet</span>}
                      </p>
                    </div>
                  </div>

                  {/* Health grade */}
                  <div className="pointer-events-none relative z-[1] hidden w-[52px] justify-center md:flex">
                    {c.seoGrade ? <Grade grade={c.seoGrade} /> : <span className="text-[12px] text-gray-faint" title="Not scanned yet">&mdash;</span>}
                  </div>

                  {/* Billing — the plan when set; a quiet dash otherwise (the Status
                      chip already carries the "No plan" verdict, so we don't repeat
                      "No plan set" as a second cell on the same row). */}
                  <div className="pointer-events-none relative z-[1] hidden md:block">
                    {c.billingConfigured ? (
                      <span className="text-[12.5px] text-warm-white">{c.billingLabel}</span>
                    ) : (
                      <span className="text-[12.5px] text-gray-faint" title="No plan set">&mdash;</span>
                    )}
                  </div>

                  {/* Status verdict */}
                  <div className="relative z-[1] flex w-[120px] items-center justify-end" title={st.detail}>
                    <Chip tone={st.tone}>{st.label}</Chip>
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
