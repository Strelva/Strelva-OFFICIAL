"use client";

import { useState } from "react";
import type { CrmActivityKind, CrmStage, TenantCrm } from "@/lib/tenant-crm";

const STAGES: { value: CrmStage; label: string; dot: string }[] = [
  { value: "lead", label: "Lead", dot: "bg-accent" },
  { value: "building", label: "Building", dot: "bg-warning" },
  { value: "live", label: "Live", dot: "bg-positive" },
  { value: "at_risk", label: "At risk", dot: "bg-warning" },
  { value: "churned", label: "Churned", dot: "bg-gray-faint" },
];

const TAG_PALETTE = [
  "bg-accent0/15 text-accent",
  "bg-positive0/15 text-positive",
  "bg-warning0/15 text-warning",
  "bg-accent0/15 text-accent",
  "bg-critical0/15 text-critical",
  "bg-accent0/15 text-accent",
];

function tagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) | 0;
  return TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length];
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

/** Maps each lifecycle type to the summary string logged by delivery-email.ts. */
const LIFECYCLE_EMAIL_SUMMARY: Record<LifecycleEmailType, string> = {
  "welcome": "Sent: welcome email",
  "site-live": "Sent: site-live email",
  "review-request": "Sent: review-request email",
};

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

/** Full-width CRM record management for a single client, rendered on the client
 *  detail page. Lifted from the old expandable-accordion list (ClientsCrm) —
 *  same /api/admin/tenants/[id]/crm + lifecycle-email endpoints, one tenant. */
export function ClientCrmSections({
  tenantId,
  ownerEmail,
  initialCrm,
}: {
  tenantId: string;
  ownerEmail: string | null;
  initialCrm: TenantCrm | null;
}) {
  const [crm, setCrm] = useState<TenantCrm>(initialCrm ?? emptyCrm(tenantId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");
  const [tagDraft, setTagDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [contactDraft, setContactDraft] = useState({ name: "", email: "", phone: "", role: "" });
  const [activityDraft, setActivityDraft] = useState<{ kind: CrmActivityKind; summary: string }>({
    kind: "call",
    summary: "",
  });
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailResult, setEmailResult] = useState<{ tone: "ok" | "paused" | "error"; msg: string } | null>(null);
  const [reviewUrlDraft, setReviewUrlDraft] = useState("");
  const [confirmType, setConfirmType] = useState<LifecycleEmailType | null>(null);

  async function write(body: {
    tags?: string[];
    stage?: CrmStage;
    note?: string;
    contact?: { name: string; email?: string; phone?: string; role?: string };
    removeContactId?: string;
    activity?: { kind: CrmActivityKind; summary: string };
  }) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/crm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setCrm(data.crm as TenantCrm);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  function addTag() {
    const raw = tagDraft.trim();
    if (!raw || crm.tags.includes(raw)) {
      setTagDraft("");
      return;
    }
    setTagDraft("");
    void write({ tags: [...crm.tags, raw] });
  }

  function addNote() {
    const text = noteDraft.trim();
    if (!text) return;
    setNoteDraft("");
    void write({ note: text });
  }

  function addContact() {
    const name = contactDraft.name.trim();
    if (!name) return;
    const draft = contactDraft;
    setContactDraft({ name: "", email: "", phone: "", role: "" });
    void write({
      contact: {
        name,
        email: draft.email.trim() || undefined,
        phone: draft.phone.trim() || undefined,
        role: draft.role.trim() || undefined,
      },
    });
  }

  function logActivity() {
    const summary = activityDraft.summary.trim();
    if (!summary) return;
    const kind = activityDraft.kind;
    setActivityDraft({ kind, summary: "" });
    void write({ activity: { kind, summary } });
  }

  async function sendEmail(type: LifecycleEmailType, reviewUrl?: string) {
    setEmailBusy(true);
    setEmailResult(null);
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/lifecycle-email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, reviewUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      if (data.paused) {
        setEmailResult({ tone: "paused", msg: "Email is paused. Turn it on to send." });
      } else if (data.sent) {
        setEmailResult({ tone: "ok", msg: "Sent ✓" });
        if (type === "review-request") {
          setReviewUrlDraft("");
        }
        // Optimistically append the activity entry so "Sent {date}" appears
        // immediately without a separate CRM fetch. The real log was written
        // server-side by logSentEmailToCrm; this mirrors what it stored.
        const now = new Date().toISOString();
        const syntheticActivity = {
          id: crypto.randomUUID(),
          kind: "email" as CrmActivityKind,
          summary: LIFECYCLE_EMAIL_SUMMARY[type],
          author: "operator",
          at: now,
        };
        setCrm((prev) => ({
          ...prev,
          activity: [syntheticActivity, ...prev.activity],
          updatedAt: now,
        }));
      } else {
        setEmailResult({ tone: "error", msg: "Send failed." });
      }
    } catch (err) {
      setEmailResult({ tone: "error", msg: err instanceof Error ? err.message : "Send failed." });
    } finally {
      setEmailBusy(false);
      setConfirmType(null);
    }
  }

  function onEmailClick(type: LifecycleEmailType) {
    if (confirmType !== type) {
      setConfirmType(type);
      return;
    }
    // review-request auto-resolves the link from the client's Google Place ID
    // server-side; an operator can still override via the optional URL field.
    const reviewUrl =
      type === "review-request" ? reviewUrlDraft.trim() || undefined : undefined;
    void sendEmail(type, reviewUrl);
  }

  const sortedNotes = [...crm.notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  /** Most-recent send timestamp for each lifecycle email type, derived from CRM activity. */
  const lifecycleSentAt: Record<LifecycleEmailType, string | null> = {
    "welcome": null,
    "site-live": null,
    "review-request": null,
  };
  for (const a of crm.activity) {
    if (a.kind !== "email") continue;
    for (const type of Object.keys(LIFECYCLE_EMAIL_SUMMARY) as LifecycleEmailType[]) {
      if (lifecycleSentAt[type] === null && a.summary === LIFECYCLE_EMAIL_SUMMARY[type]) {
        lifecycleSentAt[type] = a.at;
      }
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-warm-white">Client relationship</h2>
        <span className="text-[11px] text-gray-faint">updated {formatUpdated(crm.updatedAt)}</span>
      </div>

      {error && (
        <p className="text-xs text-critical" role="alert">
          {error}
        </p>
      )}

      {/* Stage + tags */}
      <section className="rounded-2xl border border-glass-border bg-glass p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-gray-muted">Stage</span>
          <select
            value={crm.stage ?? ""}
            disabled={busy}
            onChange={(e) => write({ stage: e.target.value as CrmStage })}
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
        <div className="flex flex-wrap items-center gap-1.5">
          {crm.tags.map((tag) => (
            <span
              key={tag}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${tagColor(tag)}`}
            >
              {tag}
              <button
                onClick={() => write({ tags: crm.tags.filter((t) => t !== tag) })}
                className="opacity-60 hover:opacity-100"
                title="Remove tag"
                aria-label={`Remove ${tag}`}
              >
                ×
              </button>
            </span>
          ))}
          <input
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
            placeholder="+ tag"
            className="w-24 rounded-full bg-gray-bg border border-glass-border px-2 py-0.5 text-[11px] text-warm-white placeholder:text-gray-faint focus:outline-none focus:border-accent/50 focus:w-32 transition-all"
          />
        </div>
      </section>

      {/* Contacts */}
      <section className="rounded-2xl border border-glass-border bg-glass p-5 space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-gray-muted">Contacts</h3>
        {crm.contacts.length === 0 ? (
          <p className="text-xs text-gray-faint">No contacts yet.</p>
        ) : (
          <ul className="space-y-2">
            {crm.contacts.map((ct) => (
              <li
                key={ct.id}
                className="flex items-start justify-between gap-2 rounded-md bg-surface-base border border-glass-border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm text-warm-white">
                    {ct.name}
                    {ct.role && <span className="text-gray-faint"> · {ct.role}</span>}
                  </p>
                  {(ct.email || ct.phone) && (
                    <p className="mt-0.5 text-[11px] text-gray-muted truncate">
                      {[ct.email, ct.phone].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => write({ removeContactId: ct.id })}
                  disabled={busy}
                  className="shrink-0 text-gray-faint hover:text-critical transition-colors disabled:opacity-40"
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
            value={contactDraft.name}
            onChange={(e) => setContactDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="Name"
            className="rounded-md bg-surface-base border border-glass-border px-3 py-2 text-sm text-warm-white placeholder:text-gray-faint focus:outline-none focus:border-accent/50"
          />
          <input
            value={contactDraft.role}
            onChange={(e) => setContactDraft((d) => ({ ...d, role: e.target.value }))}
            placeholder="Role (optional)"
            className="rounded-md bg-surface-base border border-glass-border px-3 py-2 text-sm text-warm-white placeholder:text-gray-faint focus:outline-none focus:border-accent/50"
          />
          <input
            value={contactDraft.email}
            onChange={(e) => setContactDraft((d) => ({ ...d, email: e.target.value }))}
            placeholder="Email (optional)"
            className="rounded-md bg-surface-base border border-glass-border px-3 py-2 text-sm text-warm-white placeholder:text-gray-faint focus:outline-none focus:border-accent/50"
          />
          <div className="flex gap-2">
            <input
              value={contactDraft.phone}
              onChange={(e) => setContactDraft((d) => ({ ...d, phone: e.target.value }))}
              placeholder="Phone (optional)"
              className="flex-1 rounded-md bg-surface-base border border-glass-border px-3 py-2 text-sm text-warm-white placeholder:text-gray-faint focus:outline-none focus:border-accent/50"
            />
            <button
              onClick={addContact}
              disabled={busy || !contactDraft.name.trim()}
              className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </div>
      </section>

      {/* Activity */}
      <section className="rounded-2xl border border-glass-border bg-glass p-5 space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-gray-muted">Activity</h3>
        <div className="flex items-start gap-2">
          <select
            value={activityDraft.kind}
            onChange={(e) =>
              setActivityDraft((d) => ({ ...d, kind: e.target.value as CrmActivityKind }))
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
            value={activityDraft.summary}
            onChange={(e) => setActivityDraft((d) => ({ ...d, summary: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                logActivity();
              }
            }}
            placeholder="Log a touchpoint… (↵ to save)"
            className="flex-1 rounded-md bg-surface-base border border-glass-border px-3 py-2 text-sm text-warm-white placeholder:text-gray-faint focus:outline-none focus:border-accent/50"
          />
          <button
            onClick={logActivity}
            disabled={busy || !activityDraft.summary.trim()}
            className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Log
          </button>
        </div>
        {crm.activity.length === 0 ? (
          <p className="text-xs text-gray-faint">No activity logged yet.</p>
        ) : (
          <ul className="space-y-2">
            {crm.activity.map((a) => {
              const meta = ACTIVITY_LABEL.get(a.kind);
              return (
                <li key={a.id} className="flex gap-2.5">
                  <span className="mt-0.5 text-sm text-gray-muted" aria-hidden title={meta?.label}>
                    {meta?.icon ?? "•"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-warm-white whitespace-pre-wrap">{a.summary}</p>
                    <p className="mt-0.5 text-[11px] text-gray-faint">
                      {meta?.label ?? a.kind} · {a.author} · {formatUpdated(a.at)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Notes */}
      <section className="rounded-2xl border border-glass-border bg-glass p-5 space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-gray-muted">Notes</h3>
        <div className="flex items-start gap-2">
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                addNote();
              }
            }}
            placeholder="Add a note… (⌘↵ to save)"
            rows={2}
            className="flex-1 rounded-md bg-surface-base border border-glass-border px-3 py-2 text-sm text-warm-white placeholder:text-gray-faint focus:outline-none focus:border-accent/50 resize-y"
          />
          <button
            onClick={addNote}
            disabled={busy || !noteDraft.trim()}
            className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Add
          </button>
        </div>
        {crm.notes.length === 0 ? (
          <p className="text-xs text-gray-faint">No notes yet.</p>
        ) : (
          <ul className="space-y-2">
            {sortedNotes.map((n) => (
              <li key={n.id} className="rounded-md bg-surface-base border border-glass-border px-3 py-2">
                <p className="text-sm text-warm-white whitespace-pre-wrap">{n.text}</p>
                <p className="mt-1 text-[11px] text-gray-faint">
                  {n.author} · {formatUpdated(n.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Client emails */}
      <section className="rounded-2xl border border-glass-border bg-glass p-5 space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-gray-muted">Client emails</h3>
        {!ownerEmail && (
          <p className="text-xs text-gray-faint">No owner email on file. Add one to send.</p>
        )}
        <div className="flex flex-wrap items-start gap-3">
          {LIFECYCLE_EMAILS.map(({ type, label }) => {
            const sentAt = lifecycleSentAt[type];
            const alreadySent = sentAt !== null;
            const pending = confirmType === type;
            // For already-sent types the first click becomes "Send again?" and
            // the second click confirms — making a re-send deliberately two-step.
            let buttonLabel: string;
            if (pending) {
              buttonLabel = alreadySent ? "Confirm re-send" : "Click to confirm";
            } else {
              buttonLabel = alreadySent ? "Send again?" : label;
            }
            return (
              <div key={type} className="flex flex-col items-start gap-0.5">
                <button
                  onClick={() => onEmailClick(type)}
                  disabled={emailBusy || !ownerEmail}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
                    pending
                      ? "bg-accent border-accent text-on-accent hover:opacity-90"
                      : alreadySent
                        ? "bg-surface-base border-glass-border text-gray-muted hover:border-warning/50 hover:text-warning"
                        : "bg-surface-base border-glass-border text-warm-white hover:border-accent/50"
                  }`}
                >
                  {buttonLabel}
                </button>
                {sentAt && (
                  <span className="text-[10px] text-gray-faint pl-0.5">
                    Sent {formatUpdated(sentAt)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <input
          value={reviewUrlDraft}
          onChange={(e) => setReviewUrlDraft(e.target.value)}
          placeholder="Review URL — optional, auto-filled from the client's Google Place ID"
          className="w-full rounded-md bg-surface-base border border-glass-border px-3 py-2 text-sm text-warm-white placeholder:text-gray-faint focus:outline-none focus:border-accent/50"
        />
        {emailResult && (
          <p
            className={`text-xs ${
              emailResult.tone === "ok"
                ? "text-positive"
                : emailResult.tone === "paused"
                  ? "text-warning"
                  : "text-critical"
            }`}
            role="status"
          >
            {emailResult.msg}
          </p>
        )}
      </section>
    </div>
  );
}
