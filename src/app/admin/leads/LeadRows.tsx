"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { DeliveryLead } from "@/lib/access-request-delivery";
import type { LeadWorkflow, LeadWorkflowStatus } from "@/lib/lead-workflow";
import { Chip } from "@/app/admin/console";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "";
  const mins = Math.floor(ms / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/** Days elapsed since an ISO timestamp. Returns null if the timestamp is missing/invalid. */
function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  return Math.floor(ms / 86_400_000);
}

function statusAgeLabel(status: LeadWorkflowStatus, updatedAt: string | null): string {
  const days = daysSince(updatedAt);
  if (days === null) return "";
  const label = WORKFLOW_LABEL[status];
  if (days === 0) return `${label} today`;
  if (days === 1) return `${label} 1 day ago`;
  return `${label} ${days} days ago`;
}

/** Warn when a lead has been sitting in an active-but-unresolved status for 5+ days. */
function isStale(status: LeadWorkflowStatus, updatedAt: string | null): boolean {
  if (status !== "contacted" && status !== "converting") return false;
  const days = daysSince(updatedAt);
  return days !== null && days >= 5;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type WorkflowTone = "good" | "warn" | "crit" | "neutral" | "accent";

const WORKFLOW_TONE: Record<LeadWorkflowStatus, WorkflowTone> = {
  new: "neutral",
  contacted: "warn",
  converting: "accent",
  converted: "good",
  dismissed: "neutral",
};

const WORKFLOW_LABEL: Record<LeadWorkflowStatus, string> = {
  new: "New",
  contacted: "Contacted",
  converting: "Converting",
  converted: "Converted",
  dismissed: "Dismissed",
};

const FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "converting", label: "Converting" },
  { value: "converted", label: "Converted" },
] as const;
type FilterKey = (typeof FILTER_OPTIONS)[number]["value"];

// ---------------------------------------------------------------------------
// NoteEditor
// ---------------------------------------------------------------------------

function NoteEditor({
  token,
  currentStatus,
  initialNote,
  onSave,
}: {
  token: string;
  currentStatus: LeadWorkflowStatus;
  initialNote?: string;
  onSave: (note: string) => void;
}) {
  const [value, setValue] = useState(initialNote ?? "");
  const [saving, setSaving] = useState(false);
  const lastSavedRef = useRef(initialNote ?? "");

  async function handleBlur() {
    const trimmed = value.trim();
    if (trimmed === lastSavedRef.current.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/leads/${token}/workflow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: currentStatus, note: trimmed }),
      });
      if (res.ok) {
        lastSavedRef.current = trimmed;
        onSave(trimmed);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void handleBlur()}
        placeholder="Add a note…"
        rows={2}
        className="w-full resize-none rounded-lg border border-glass-border bg-white/[0.04] px-3 py-2 text-xs text-warm-white placeholder:text-gray-faint/60 focus:border-accent/40 focus:outline-none transition-colors"
      />
      {saving && (
        <span className="absolute right-2 bottom-2 text-[10px] text-gray-faint">saving…</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LeadCard
// ---------------------------------------------------------------------------

function LeadCard({
  lead,
  wf,
  pending,
  notesByToken,
  onStatusChange,
  onNoteChange,
  onConvert,
  receded,
}: {
  lead: DeliveryLead;
  wf: LeadWorkflow;
  pending: boolean;
  notesByToken: Record<string, string>;
  onStatusChange: (token: string, status: LeadWorkflowStatus) => Promise<boolean>;
  onNoteChange: (token: string, note: string) => void;
  onConvert: (lead: DeliveryLead) => Promise<void>;
  receded: boolean;
}) {
  const status = wf.status;
  const updatedAt = wf.updatedAt ?? lead.statusUpdatedAt;
  const ageLabel = statusAgeLabel(status, updatedAt);
  const stale = isStale(status, updatedAt);
  const currentNote = notesByToken[lead.statusToken] ?? wf.note ?? "";

  return (
    <div
      className={`px-5 py-4 transition-colors hover:bg-white/[0.02] ${receded ? "opacity-50" : ""}`}
    >
      {/* Row 1: status badge + age + submitted time */}
      <div className="flex flex-wrap items-center gap-2 mb-2.5">
        <Chip tone={WORKFLOW_TONE[status]}>{WORKFLOW_LABEL[status]}</Chip>
        {ageLabel && (
          <span
            className={`text-[11px] ${stale ? "text-warning font-medium" : "text-gray-faint"}`}
          >
            {ageLabel}
          </span>
        )}
        {lead.currentWebsite && (
          <a
            href={lead.currentWebsite}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View current site"
            className="ml-auto text-gray-faint hover:text-gray-muted transition-colors"
            title={lead.currentWebsite}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        )}
      </div>

      {/* Row 2: business name + meta */}
      <div className="mb-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-medium text-warm-white leading-snug">{lead.businessName}</span>
          {lead.location && (
            <span className="text-xs text-gray-faint">{lead.location}</span>
          )}
          <span className="text-[11px] text-gray-faint ml-auto shrink-0">
            {relativeTime(lead.submittedAt)}
          </span>
        </div>
        {lead.referredBy && (
          <p className="text-[11px] text-gray-faint mt-0.5">Ref: {lead.referredBy}</p>
        )}
      </div>

      {/* Row 3: message */}
      {lead.description && (
        <p className="mt-2 text-xs text-gray-muted whitespace-pre-wrap leading-relaxed">
          {lead.description}
        </p>
      )}

      {/* Row 4: contact line */}
      <div className="mt-2.5 flex flex-wrap items-center gap-3">
        <a
          href={`mailto:${lead.email}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-glass-border px-2.5 py-1 text-[11.5px] text-gray-muted hover:text-warm-white hover:border-accent/30 transition-colors"
          title={`Email ${lead.email}`}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
          Reply
        </a>
        {lead.phone && (
          <span className="text-[11.5px] text-gray-faint">{lead.phone}</span>
        )}
      </div>

      {/* Row 5: note editor */}
      <div className="mt-3">
        <NoteEditor
          token={lead.statusToken}
          currentStatus={status}
          initialNote={currentNote}
          onSave={(note) => onNoteChange(lead.statusToken, note)}
        />
      </div>

      {/* Row 6: actions */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {status === "dismissed" ? (
          <button
            onClick={() => void onStatusChange(lead.statusToken, "new")}
            disabled={pending}
            className="rounded-md border border-glass-border px-2.5 py-1 text-xs text-warm-white transition-colors hover:bg-gray-bg disabled:opacity-40"
          >
            Restore
          </button>
        ) : (
          <>
            <button
              onClick={() => void onStatusChange(lead.statusToken, "contacted")}
              disabled={pending || status === "contacted"}
              className="rounded-md border border-glass-border px-2.5 py-1 text-xs text-warm-white transition-colors hover:bg-gray-bg disabled:opacity-40"
            >
              Mark contacted
            </button>
            <button
              onClick={() => void onConvert(lead)}
              disabled={pending}
              className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              Convert
            </button>
            <button
              onClick={() => void onStatusChange(lead.statusToken, "dismissed")}
              disabled={pending}
              className="rounded-md border border-glass-border px-2.5 py-1 text-xs text-gray-muted transition-colors hover:bg-gray-bg hover:text-warm-white disabled:opacity-40"
            >
              Dismiss
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LeadRows (main export)
// ---------------------------------------------------------------------------

export function LeadRows({
  leads,
  initialWorkflow,
}: {
  leads: DeliveryLead[];
  initialWorkflow: Record<string, LeadWorkflow>;
}) {
  const router = useRouter();
  const [workflow, setWorkflow] = useState<Record<string, LeadWorkflow>>(initialWorkflow);
  const [notesByToken, setNotesByToken] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const [token, wf] of Object.entries(initialWorkflow)) {
      if (wf.note) init[token] = wf.note;
    }
    return init;
  });
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [showDismissed, setShowDismissed] = useState(false);

  function statusOf(token: string): LeadWorkflowStatus {
    return workflow[token]?.status ?? "new";
  }

  function updatedAtOf(token: string): string | null {
    return workflow[token]?.updatedAt ?? null;
  }

  async function setStatus(token: string, status: LeadWorkflowStatus): Promise<boolean> {
    setPending((p) => ({ ...p, [token]: true }));
    setActionError(null);
    try {
      const note = notesByToken[token] ?? workflow[token]?.note ?? "";
      const res = await fetch(`/api/admin/leads/${token}/workflow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note: note || undefined }),
      });
      if (!res.ok) {
        setActionError("Couldn't update that lead — try again.");
        return false;
      }
      const data = (await res.json()) as { workflow: LeadWorkflow };
      setWorkflow((w) => ({ ...w, [token]: data.workflow }));
      return true;
    } catch {
      setActionError("Couldn't update that lead — check your connection.");
      return false;
    } finally {
      setPending((p) => ({ ...p, [token]: false }));
    }
  }

  async function convert(lead: DeliveryLead): Promise<void> {
    // Only route to onboarding once the "converting" marker actually saved, so we
    // don't leave the lead untouched while the operator lands on a fresh form.
    const ok = await setStatus(lead.statusToken, "converting");
    if (!ok) return;
    const q = new URLSearchParams({
      siteName: lead.businessName,
      ownerEmail: lead.email,
      leadToken: lead.statusToken,
    });
    router.push(`/admin/onboard?${q.toString()}`);
  }

  function handleNoteChange(token: string, note: string): void {
    setNotesByToken((n) => ({ ...n, [token]: note }));
  }

  // Split active vs dismissed; apply status filter on active.
  const { active, dismissed } = useMemo(() => {
    const activeList: DeliveryLead[] = [];
    const dismissedList: DeliveryLead[] = [];
    for (const lead of leads) {
      if ((workflow[lead.statusToken]?.status ?? "new") === "dismissed") dismissedList.push(lead);
      else activeList.push(lead);
    }
    return { active: activeList, dismissed: dismissedList };
  }, [leads, workflow]);

  const filtered = useMemo(() => {
    if (filter === "all") return active;
    return active.filter((l) => (workflow[l.statusToken]?.status ?? "new") === filter);
  }, [active, filter, workflow]);

  // Summary counts for the filter strip
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: active.length };
    for (const l of active) {
      const s = workflow[l.statusToken]?.status ?? "new";
      c[s] = (c[s] ?? 0) + 1;
    }
    return c;
  }, [active, workflow]);

  function renderList(rows: DeliveryLead[], receded: boolean) {
    return (
      <div className="rounded-2xl border border-glass-border bg-glass overflow-hidden divide-y divide-glass-border/50">
        {rows.map((lead) => (
          <LeadCard
            key={lead.statusToken}
            lead={lead}
            wf={workflow[lead.statusToken] ?? { token: lead.statusToken, status: "new", updatedAt: null }}
            pending={Boolean(pending[lead.statusToken])}
            notesByToken={notesByToken}
            onStatusChange={setStatus}
            onNoteChange={handleNoteChange}
            onConvert={convert}
            receded={receded}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {actionError && (
        <p className="rounded-lg border border-critical/30 bg-critical/10 px-3 py-2 text-[12px] text-critical" role="alert">
          {actionError}
        </p>
      )}
      {/* Filter strip — only shown when there are active leads */}
      {active.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {FILTER_OPTIONS.map((opt) => {
            const count = counts[opt.value] ?? 0;
            if (opt.value !== "all" && count === 0) return null;
            const isActive = filter === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setFilter(opt.value)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-glass-border bg-glass text-gray-muted hover:text-warm-white"
                }`}
              >
                {opt.label}
                <span className={`font-mono tabular-nums ${isActive ? "text-accent/70" : "text-gray-faint"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Active leads */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-glass-border bg-glass p-10 text-center">
          <p className="text-sm font-medium text-warm-white">
            {active.length === 0 ? "No prospects to work" : `No ${filter} prospects`}
          </p>
          <p className="mt-1 text-xs text-gray-muted">
            {active.length === 0 && dismissed.length > 0
              ? "Every prospect has been worked or dismissed."
              : active.length === 0
                ? "Access requests land here the moment they come in."
                : "Try a different filter."}
          </p>
        </div>
      ) : (
        renderList(filtered, false)
      )}

      {/* Dismissed section */}
      {dismissed.length > 0 && (
        <div className="space-y-3">
          <button
            onClick={() => setShowDismissed((s) => !s)}
            className="text-xs font-medium text-gray-muted hover:text-warm-white transition-colors"
          >
            {showDismissed ? "Hide" : "Show"} dismissed ({dismissed.length})
          </button>
          {showDismissed && renderList(dismissed, true)}
        </div>
      )}
    </div>
  );
}
