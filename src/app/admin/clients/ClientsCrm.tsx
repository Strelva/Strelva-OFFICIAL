"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CrmActivityKind, CrmStage, TenantCrm } from "@/lib/tenant-crm";

interface ClientRow {
  id: string;
  siteName: string;
  ownerEmail: string | null;
  ownerName: string | null;
  active: boolean;
  /** ISO of the owner's last activity (activity[0]?.time), or null. */
  lastActivity: string | null;
  /** Effective subscription status (founder-comp aware), or null. */
  subscriptionStatus: string | null;
  /** Top at-risk reason from getAtRiskTenants, or null if not at risk. */
  atRiskReason: string | null;
  /** Proxy-resolvable dashboard URL (getTenantDashboardFallbackUrl), computed
   *  server-side so the link opens the client's dashboard on the app host. */
  dashboardUrl: string;
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

const ACTIVITY_KINDS: { value: CrmActivityKind; label: string; icon: string }[] = [
  { value: "call", label: "Call", icon: "☎" },
  { value: "email", label: "Email", icon: "✉" },
  { value: "meeting", label: "Meeting", icon: "◷" },
  { value: "note", label: "Note", icon: "✎" },
];

const ACTIVITY_LABEL = new Map(ACTIVITY_KINDS.map((k) => [k.value, k]));

type LifecycleEmailType = "welcome" | "site-live" | "review-request";

const LIFECYCLE_EMAILS: { type: LifecycleEmailType; label: string }[] = [
  { type: "welcome", label: "Send welcome" },
  { type: "site-live", label: "Send site-live" },
  { type: "review-request", label: "Send review request" },
];

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

// Static Tailwind classes per subscription status (dynamic names don't survive
// the build-time scan). Only healthy/known states get a chip.
const SUBSCRIPTION_CHIP: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-300",
  trialing: "bg-sky-500/15 text-sky-300",
  past_due: "bg-rose-500/15 text-rose-300",
  cancelled: "bg-gray-faint/15 text-gray-faint",
};

function subscriptionLabel(status: string): string {
  return status === "past_due" ? "past due" : status;
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
  const [contactDraft, setContactDraft] = useState<
    Record<string, { name: string; email: string; phone: string; role: string }>
  >({});
  const [activityDraft, setActivityDraft] = useState<
    Record<string, { kind: CrmActivityKind; summary: string }>
  >({});
  const [emailBusy, setEmailBusy] = useState<Record<string, boolean>>({});
  const [emailResult, setEmailResult] = useState<
    Record<string, { tone: "ok" | "paused" | "error"; msg: string }>
  >({});
  const [reviewUrlDraft, setReviewUrlDraft] = useState<Record<string, string>>({});
  const [showReviewInput, setShowReviewInput] = useState<Record<string, boolean>>({});
  // Two-tap confirm — the pending "click to confirm" button, keyed `${id}:${type}`.
  const [confirmKey, setConfirmKey] = useState<string | null>(null);

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
    body: {
      tags?: string[];
      stage?: CrmStage;
      note?: string;
      contact?: { name: string; email?: string; phone?: string; role?: string };
      removeContactId?: string;
      activity?: { kind: CrmActivityKind; summary: string };
    }
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

  function addContact(id: string) {
    const draft = contactDraft[id];
    const name = (draft?.name ?? "").trim();
    if (!name) return;
    setContactDraft((d) => ({
      ...d,
      [id]: { name: "", email: "", phone: "", role: "" },
    }));
    void write(id, {
      contact: {
        name,
        email: (draft?.email ?? "").trim() || undefined,
        phone: (draft?.phone ?? "").trim() || undefined,
        role: (draft?.role ?? "").trim() || undefined,
      },
    });
  }

  function removeContact(id: string, contactId: string) {
    void write(id, { removeContactId: contactId });
  }

  function logActivity(id: string) {
    const draft = activityDraft[id];
    const summary = (draft?.summary ?? "").trim();
    if (!summary) return;
    const kind = draft?.kind ?? "call";
    setActivityDraft((d) => ({ ...d, [id]: { kind, summary: "" } }));
    void write(id, { activity: { kind, summary } });
  }

  async function sendEmail(id: string, type: LifecycleEmailType, reviewUrl?: string) {
    setEmailBusy((s) => ({ ...s, [id]: true }));
    setEmailResult((r) => {
      const next = { ...r };
      delete next[id];
      return next;
    });
    try {
      const res = await fetch(`/api/admin/tenants/${id}/lifecycle-email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, reviewUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      if (data.paused) {
        setEmailResult((r) => ({
          ...r,
          [id]: { tone: "paused", msg: "Email is paused — turn it on to send." },
        }));
      } else if (data.sent) {
        setEmailResult((r) => ({ ...r, [id]: { tone: "ok", msg: "Sent ✓" } }));
        if (type === "review-request") {
          setShowReviewInput((s) => ({ ...s, [id]: false }));
          setReviewUrlDraft((d) => ({ ...d, [id]: "" }));
        }
      } else {
        setEmailResult((r) => ({ ...r, [id]: { tone: "error", msg: "Send failed." } }));
      }
    } catch (err) {
      setEmailResult((r) => ({
        ...r,
        [id]: { tone: "error", msg: err instanceof Error ? err.message : "Send failed." },
      }));
    } finally {
      setEmailBusy((s) => ({ ...s, [id]: false }));
      setConfirmKey(null);
    }
  }

  function onEmailClick(id: string, type: LifecycleEmailType) {
    const key = `${id}:${type}`;
    if (type === "review-request") {
      if (!showReviewInput[id]) {
        setShowReviewInput((s) => ({ ...s, [id]: true }));
        return;
      }
      if (!(reviewUrlDraft[id] ?? "").trim()) return;
    }
    if (confirmKey !== key) {
      setConfirmKey(key);
      return;
    }
    const reviewUrl =
      type === "review-request" ? (reviewUrlDraft[id] ?? "").trim() : undefined;
    void sendEmail(id, type, reviewUrl);
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
                        {c.siteName || c.ownerName || c.id}
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

                    {/* Health + recency signals */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]">
                      <span className="text-gray-faint">
                        {c.lastActivity
                          ? `active ${formatUpdated(c.lastActivity)}`
                          : "no activity"}
                      </span>
                      {c.subscriptionStatus &&
                        SUBSCRIPTION_CHIP[c.subscriptionStatus] && (
                          <span
                            className={`inline-flex items-center rounded-full px-1.5 py-0.5 ${SUBSCRIPTION_CHIP[c.subscriptionStatus]}`}
                          >
                            {subscriptionLabel(c.subscriptionStatus)}
                          </span>
                        )}
                      {c.atRiskReason && (
                        <span
                          className="inline-flex items-center gap-1 text-rose-300"
                          title={c.atRiskReason}
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full bg-red-400"
                            aria-hidden
                          />
                          {c.atRiskReason}
                        </span>
                      )}
                    </div>

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
                        className="rounded-md bg-surface-base border border-glass-border px-2 py-1 text-xs text-warm-white focus:outline-none focus:border-accent/50 disabled:opacity-40"
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
                        href={c.dashboardUrl}
                        className="text-accent hover:underline"
                      >
                        Open dashboard →
                      </Link>
                      <span className="text-gray-faint">·</span>
                      <button
                        onClick={() => setExpanded(isOpen ? null : c.id)}
                        className="text-gray-muted hover:text-warm-white transition-colors"
                        aria-expanded={isOpen}
                        title="contacts · activity · notes"
                      >
                        Details ({rec.contacts.length} · {rec.activity.length} · {rec.notes.length})
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

                {/* Detail drawer */}
                {isOpen && (
                  <div className="border-t border-glass-border bg-gray-bg/40 p-4 space-y-6">
                    {/* Contacts */}
                    <section className="space-y-3">
                      <h3 className="text-xs font-medium uppercase tracking-wide text-gray-muted">
                        Contacts
                      </h3>
                      {rec.contacts.length === 0 ? (
                        <p className="text-xs text-gray-faint">No contacts yet.</p>
                      ) : (
                        <ul className="space-y-2">
                          {rec.contacts.map((ct) => (
                            <li
                              key={ct.id}
                              className="flex items-start justify-between gap-2 rounded-md bg-surface-base border border-glass-border px-3 py-2"
                            >
                              <div className="min-w-0">
                                <p className="text-sm text-warm-white">
                                  {ct.name}
                                  {ct.role && (
                                    <span className="text-gray-faint"> · {ct.role}</span>
                                  )}
                                </p>
                                {(ct.email || ct.phone) && (
                                  <p className="mt-0.5 text-[11px] text-gray-muted truncate">
                                    {[ct.email, ct.phone].filter(Boolean).join(" · ")}
                                  </p>
                                )}
                              </div>
                              <button
                                onClick={() => removeContact(c.id, ct.id)}
                                disabled={busy}
                                className="shrink-0 text-gray-faint hover:text-rose-400 transition-colors disabled:opacity-40"
                                title="Remove contact"
                                aria-label={`Remove ${ct.name}`}
                              >
                                ×
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <input
                          value={contactDraft[c.id]?.name ?? ""}
                          onChange={(e) =>
                            setContactDraft((d) => ({
                              ...d,
                              [c.id]: {
                                name: e.target.value,
                                email: d[c.id]?.email ?? "",
                                phone: d[c.id]?.phone ?? "",
                                role: d[c.id]?.role ?? "",
                              },
                            }))
                          }
                          placeholder="Name"
                          className="rounded-md bg-surface-base border border-glass-border px-3 py-2 text-sm text-warm-white placeholder:text-gray-faint focus:outline-none focus:border-accent/50"
                        />
                        <input
                          value={contactDraft[c.id]?.role ?? ""}
                          onChange={(e) =>
                            setContactDraft((d) => ({
                              ...d,
                              [c.id]: {
                                name: d[c.id]?.name ?? "",
                                email: d[c.id]?.email ?? "",
                                phone: d[c.id]?.phone ?? "",
                                role: e.target.value,
                              },
                            }))
                          }
                          placeholder="Role (optional)"
                          className="rounded-md bg-surface-base border border-glass-border px-3 py-2 text-sm text-warm-white placeholder:text-gray-faint focus:outline-none focus:border-accent/50"
                        />
                        <input
                          value={contactDraft[c.id]?.email ?? ""}
                          onChange={(e) =>
                            setContactDraft((d) => ({
                              ...d,
                              [c.id]: {
                                name: d[c.id]?.name ?? "",
                                email: e.target.value,
                                phone: d[c.id]?.phone ?? "",
                                role: d[c.id]?.role ?? "",
                              },
                            }))
                          }
                          placeholder="Email (optional)"
                          className="rounded-md bg-surface-base border border-glass-border px-3 py-2 text-sm text-warm-white placeholder:text-gray-faint focus:outline-none focus:border-accent/50"
                        />
                        <div className="flex gap-2">
                          <input
                            value={contactDraft[c.id]?.phone ?? ""}
                            onChange={(e) =>
                              setContactDraft((d) => ({
                                ...d,
                                [c.id]: {
                                  name: d[c.id]?.name ?? "",
                                  email: d[c.id]?.email ?? "",
                                  phone: e.target.value,
                                  role: d[c.id]?.role ?? "",
                                },
                              }))
                            }
                            placeholder="Phone (optional)"
                            className="flex-1 rounded-md bg-surface-base border border-glass-border px-3 py-2 text-sm text-warm-white placeholder:text-gray-faint focus:outline-none focus:border-accent/50"
                          />
                          <button
                            onClick={() => addContact(c.id)}
                            disabled={busy || !(contactDraft[c.id]?.name ?? "").trim()}
                            className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-40"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    </section>

                    {/* Activity */}
                    <section className="space-y-3">
                      <h3 className="text-xs font-medium uppercase tracking-wide text-gray-muted">
                        Activity
                      </h3>
                      <div className="flex items-start gap-2">
                        <select
                          value={activityDraft[c.id]?.kind ?? "call"}
                          onChange={(e) =>
                            setActivityDraft((d) => ({
                              ...d,
                              [c.id]: {
                                kind: e.target.value as CrmActivityKind,
                                summary: d[c.id]?.summary ?? "",
                              },
                            }))
                          }
                          className="rounded-md bg-surface-base border border-glass-border px-2 py-2 text-sm text-warm-white focus:outline-none focus:border-accent/50"
                        >
                          {ACTIVITY_KINDS.map((k) => (
                            <option key={k.value} value={k.value}>
                              {k.label}
                            </option>
                          ))}
                        </select>
                        <input
                          value={activityDraft[c.id]?.summary ?? ""}
                          onChange={(e) =>
                            setActivityDraft((d) => ({
                              ...d,
                              [c.id]: {
                                kind: d[c.id]?.kind ?? "call",
                                summary: e.target.value,
                              },
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              logActivity(c.id);
                            }
                          }}
                          placeholder="Log a touchpoint… (↵ to save)"
                          className="flex-1 rounded-md bg-surface-base border border-glass-border px-3 py-2 text-sm text-warm-white placeholder:text-gray-faint focus:outline-none focus:border-accent/50"
                        />
                        <button
                          onClick={() => logActivity(c.id)}
                          disabled={busy || !(activityDraft[c.id]?.summary ?? "").trim()}
                          className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-40"
                        >
                          Log
                        </button>
                      </div>
                      {rec.activity.length === 0 ? (
                        <p className="text-xs text-gray-faint">No activity logged yet.</p>
                      ) : (
                        <ul className="space-y-2">
                          {rec.activity.map((a) => {
                            const meta = ACTIVITY_LABEL.get(a.kind);
                            return (
                              <li key={a.id} className="flex gap-2.5">
                                <span
                                  className="mt-0.5 text-sm text-gray-muted"
                                  aria-hidden
                                  title={meta?.label}
                                >
                                  {meta?.icon ?? "•"}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm text-warm-white whitespace-pre-wrap">
                                    {a.summary}
                                  </p>
                                  <p className="mt-0.5 text-[11px] text-gray-faint">
                                    {meta?.label ?? a.kind} · {a.author} ·{" "}
                                    {formatUpdated(a.at)}
                                  </p>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </section>

                    {/* Notes */}
                    <section className="space-y-3">
                      <h3 className="text-xs font-medium uppercase tracking-wide text-gray-muted">
                        Notes
                      </h3>
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
                    </section>

                    {/* Client emails */}
                    <section className="space-y-3">
                      <h3 className="text-xs font-medium uppercase tracking-wide text-gray-muted">
                        Client emails
                      </h3>
                      {!c.ownerEmail && (
                        <p className="text-xs text-gray-faint">
                          No owner email on file — add one to send.
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        {LIFECYCLE_EMAILS.map(({ type, label }) => {
                          const key = `${c.id}:${type}`;
                          const pending = confirmKey === key;
                          return (
                            <button
                              key={type}
                              onClick={() => onEmailClick(c.id, type)}
                              disabled={emailBusy[c.id] || !c.ownerEmail}
                              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
                                pending
                                  ? "bg-accent border-accent text-on-accent hover:opacity-90"
                                  : "bg-surface-base border-glass-border text-warm-white hover:border-accent/50"
                              }`}
                            >
                              {pending ? "Click to confirm" : label}
                            </button>
                          );
                        })}
                      </div>
                      {showReviewInput[c.id] && (
                        <input
                          value={reviewUrlDraft[c.id] ?? ""}
                          onChange={(e) =>
                            setReviewUrlDraft((d) => ({ ...d, [c.id]: e.target.value }))
                          }
                          placeholder="Review URL (e.g. https://g.page/r/…/review)"
                          className="w-full rounded-md bg-surface-base border border-glass-border px-3 py-2 text-sm text-warm-white placeholder:text-gray-faint focus:outline-none focus:border-accent/50"
                        />
                      )}
                      {emailResult[c.id] && (
                        <p
                          className={`text-xs ${
                            emailResult[c.id].tone === "ok"
                              ? "text-emerald-400"
                              : emailResult[c.id].tone === "paused"
                                ? "text-amber-400"
                                : "text-rose-400"
                          }`}
                          role="status"
                        >
                          {emailResult[c.id].msg}
                        </p>
                      )}
                    </section>
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
