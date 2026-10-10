"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  type DeliveryLead,
  type DeliveryStatus,
  DELIVERY_STATUSES,
  deliveryStatusLabel,
} from "@/lib/access-request-delivery";
import type { LeadWorkflow, LeadWorkflowStatus } from "@/lib/lead-workflow";
import { StEmpty, StField, StMono, StNotice, StPill, StRow, StRows, StSegmented, StState, StTextButton, type BeaconKind } from "@/components/ui/strelva/Kit";

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

type WorkflowTone = BeaconKind;

const WORKFLOW_TONE: Record<LeadWorkflowStatus, WorkflowTone> = {
  new: "draft",
  contacted: "need",
  converting: "need",
  converted: "live",
  dismissed: "draft",
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
  readOnly,
}: {
  token: string;
  currentStatus: LeadWorkflowStatus;
  initialNote?: string;
  onSave: (note: string) => void;
  readOnly: boolean;
}) {
  const [value, setValue] = useState(initialNote ?? "");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const lastSavedRef = useRef(initialNote ?? "");

  async function handleBlur() {
    if (readOnly) return;
    const trimmed = value.trim();
    if (trimmed === lastSavedRef.current.trim()) return;
    setSaving(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/admin/leads/${token}/workflow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: currentStatus, note: trimmed }),
      });
      if (res.ok) {
        lastSavedRef.current = trimmed;
        onSave(trimmed);
      } else {
        setFailed(true);
      }
    } catch {
      // Network/throw — surface it so the note isn't silently lost.
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return <div className="flex flex-col gap-2">
    <StField label="Internal note" hint="Saved when you leave this field.">
      <textarea value={value} disabled={readOnly} onChange={event => setValue(event.target.value)} onBlur={() => void handleBlur()} placeholder="Add a note…" rows={2} />
    </StField>
    {saving ? <span role="status">Saving…</span> : failed ? <StNotice tone="critical">Note not saved. Leave the field again to retry.</StNotice> : null}
  </div>;
}

// ---------------------------------------------------------------------------
// LeadCard
// ---------------------------------------------------------------------------

function LeadCard({
  lead,
  wf,
  pending,
  notesByToken,
  stage,
  onStageChange,
  onNoteChange,
  onConvert,
  receded,
  readOnly,
}: {
  lead: DeliveryLead;
  wf: LeadWorkflow;
  pending: boolean;
  notesByToken: Record<string, string>;
  stage: DeliveryStatus;
  onStageChange: (token: string, stage: DeliveryStatus) => Promise<boolean>;
  onNoteChange: (token: string, note: string) => void;
  onConvert: (lead: DeliveryLead) => Promise<void>;
  receded: boolean;
  readOnly: boolean;
}) {
  const status = wf.status;
  const updatedAt = wf.updatedAt ?? lead.statusUpdatedAt;
  const ageLabel = statusAgeLabel(status, updatedAt);
  const stale = isStale(status, updatedAt);
  const currentNote = notesByToken[lead.statusToken] ?? wf.note ?? "";

  return <StRow title={lead.businessName} detail={lead.location || undefined} kind={receded ? "Dismissed prospect" : "Site request"} end={<StState kind={WORKFLOW_TONE[status]}>{WORKFLOW_LABEL[status]}</StState>} align="start">
    <div className="flex flex-col gap-4 pt-4">
      <div className="flex flex-wrap items-center gap-4">
        <StMono>{relativeTime(lead.submittedAt)}</StMono>
        {ageLabel ? <StMono tone={stale ? "need" : undefined}>{ageLabel}</StMono> : null}
        {lead.currentWebsite ? <StTextButton href={lead.currentWebsite} target="_blank" rel="noopener noreferrer">View current site</StTextButton> : null}
      </div>
      {lead.referredBy ? <p className="text-sm text-gray-muted">Referred by {lead.referredBy}</p> : null}
      {lead.description ? <p className="whitespace-pre-wrap text-sm text-gray-muted">{lead.description}</p> : null}
      <div className="flex flex-wrap items-center gap-4">
        <StTextButton href={`mailto:${lead.email}`}>Reply to {lead.email}</StTextButton>
        {lead.phone ? <StMono>{lead.phone}</StMono> : null}
      </div>
      <NoteEditor token={lead.statusToken} currentStatus={status} initialNote={currentNote} readOnly={readOnly} onSave={note => onNoteChange(lead.statusToken, note)} />
      <StField label="Client sees">
        <select value={stage} disabled={readOnly || pending} onChange={event => void onStageChange(lead.statusToken, event.target.value as DeliveryStatus)}>
          {DELIVERY_STATUSES.map(item => <option key={item} value={item}>{deliveryStatusLabel(item)}</option>)}
        </select>
      </StField>
      <div className="flex justify-end"><StPill variant="soft" onClick={() => void onConvert(lead)} disabled={readOnly || pending} title="Provision the site and take the lead live">Convert</StPill></div>
    </div>
  </StRow>;
}

// ---------------------------------------------------------------------------
// LeadRows (main export)
// ---------------------------------------------------------------------------

export function LeadRows({
  leads,
  initialWorkflow,
  readOnly = false,
}: {
  leads: DeliveryLead[];
  initialWorkflow: Record<string, LeadWorkflow>;
  readOnly?: boolean;
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
  const [stageByToken, setStageByToken] = useState<Record<string, DeliveryStatus>>(() => {
    const init: Record<string, DeliveryStatus> = {};
    for (const l of leads) init[l.statusToken] = l.deliveryStatus;
    return init;
  });
  const [actionError, setActionError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [showDismissed, setShowDismissed] = useState(false);

  async function setStatus(token: string, status: LeadWorkflowStatus): Promise<boolean> {
    if (readOnly) return false;
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

  // Set the customer-facing delivery stage directly (the tracker link updates).
  async function setDeliveryStage(token: string, stage: DeliveryStatus): Promise<boolean> {
    if (readOnly) return false;
    const prev = stageByToken[token];
    setStageByToken((s) => ({ ...s, [token]: stage })); // optimistic
    setPending((p) => ({ ...p, [token]: true }));
    setActionError(null);
    try {
      const note = notesByToken[token] ?? workflow[token]?.note ?? "";
      const res = await fetch(`/api/admin/leads/${token}/workflow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage, note: note || undefined }),
      });
      if (!res.ok) {
        setActionError("Couldn't update that lead — try again.");
        if (prev) setStageByToken((s) => ({ ...s, [token]: prev }));
        return false;
      }
      const data = (await res.json()) as { workflow: LeadWorkflow };
      setWorkflow((w) => ({ ...w, [token]: data.workflow }));
      return true;
    } catch {
      setActionError("Couldn't update that lead — check your connection.");
      if (prev) setStageByToken((s) => ({ ...s, [token]: prev }));
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
    return <StRows label={receded ? "Dismissed prospects" : "Active prospects"}>{rows.map(lead => <LeadCard key={lead.statusToken} lead={lead} wf={workflow[lead.statusToken] ?? { token: lead.statusToken, status: "new", updatedAt: null }} pending={Boolean(pending[lead.statusToken])} notesByToken={notesByToken} stage={stageByToken[lead.statusToken] ?? lead.deliveryStatus} onStageChange={setDeliveryStage} onNoteChange={handleNoteChange} onConvert={convert} receded={receded} readOnly={readOnly} />)}</StRows>;
  }

  return <div className="flex flex-col gap-6">
    {actionError ? <StNotice tone="critical">{actionError}</StNotice> : null}
    {active.length > 0 ? <StSegmented value={filter} label="Filter prospects" onChange={setFilter} options={FILTER_OPTIONS.filter(option => option.value === "all" || (counts[option.value] ?? 0) > 0).map(option => ({ value: option.value, label: `${option.label} (${counts[option.value] ?? 0})` }))} /> : null}
    {filtered.length ? renderList(filtered, false) : <StEmpty>{active.length === 0 ? "No prospects to review. Access requests will appear here." : `No ${filter} prospects. Try a different filter.`}</StEmpty>}
    {dismissed.length ? <div className="flex flex-col gap-4"><StTextButton onClick={() => setShowDismissed(value => !value)} aria-expanded={showDismissed}>{showDismissed ? "Hide" : "Show"} dismissed ({dismissed.length})</StTextButton>{showDismissed ? renderList(dismissed, true) : null}</div> : null}
  </div>;
}
