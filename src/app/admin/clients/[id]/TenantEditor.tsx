"use client";

import { useState, useEffect, useCallback, useId } from "react";
import { Toggle } from "@/components/ui/Toggle";
import { getToggleableRegistry } from "@/lib/features/registry";
import { Field } from "@/app/admin/ui";

interface EditableTenant {
  id: string;
  siteName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  referredBy: string;
  bookingProvider: string;
  bookingUrl: string;
  productionDomain: string;
  adminDomain: string;
  active: boolean;
  revalidateUrl: string;
  hasRevalidationSecret: boolean;
  /** Enabled dashboard features (see src/lib/features/registry.ts). */
  features: string[];
}

interface TenantMember {
  userId: string;
  email: string;
  role: string;
  assignedAt: string;
}

export function TenantEditor({ tenant }: { tenant: EditableTenant }) {
  const roleSelectId = useId();
  const [form, setForm] = useState(tenant);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Assign-user form
  const [assignEmail, setAssignEmail] = useState("");
  const [assignRole, setAssignRole] = useState<"owner" | "admin" | "editor" | "viewer">("owner");
  const [assigning, setAssigning] = useState(false);
  const [assignNote, setAssignNote] = useState<string | null>(null);

  // Deactivate confirm
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  // Members list
  const [members, setMembers] = useState<TenantMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);

  const membersUrl = `/api/admin/tenants/${tenant.id}/members`;

  const fetchMembers = useCallback(async () => {
    setMembersLoading(true);
    try {
      const res = await fetch(membersUrl);
      if (res.ok) {
        const data = (await res.json()) as { members: TenantMember[] };
        setMembers(data.members ?? []);
      }
    } catch {
      // fail-soft: list stays empty, grant still works
    } finally {
      setMembersLoading(false);
    }
  }, [membersUrl]);

  useEffect(() => {
    void fetchMembers();
  }, [fetchMembers]);

  async function save() {
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/tenants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: form.id,
          siteName: form.siteName,
          ownerName: form.ownerName,
          ownerEmail: form.ownerEmail || undefined,
          ownerPhone: form.ownerPhone,
          referredBy: form.referredBy,
          bookingProvider: form.bookingProvider,
          bookingUrl: form.bookingUrl,
          productionDomain: form.productionDomain || undefined,
          adminDomain: form.adminDomain || undefined,
          active: form.active,
          features: form.features,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function assign() {
    setAssignNote(null);
    if (!assignEmail.trim()) return;
    setAssigning(true);
    try {
      const res = await fetch("/api/admin/tenants/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: assignEmail.trim(), tenant: form.id, role: assignRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setAssignNote(`✓ ${assignEmail} assigned as ${assignRole}`);
      setAssignEmail("");
      await fetchMembers();
    } catch (err) {
      setAssignNote(err instanceof Error ? err.message : "Assign failed");
    } finally {
      setAssigning(false);
    }
  }

  async function revoke(userId: string) {
    setRevokingId(userId);
    setAssignNote(null);
    try {
      const res = await fetch(membersUrl, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setMembers((data as { members: TenantMember[] }).members ?? []);
    } catch (err) {
      setAssignNote(err instanceof Error ? err.message : "Revoke failed");
    } finally {
      setRevokingId(null);
      setConfirmRevokeId(null);
    }
  }

  async function resendOwnerInvite() {
    if (!form.ownerEmail.trim()) {
      setAssignNote("Add an owner email first (save it above).");
      return;
    }
    setAssignNote(null);
    setAssigning(true);
    try {
      const res = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.ownerEmail.trim(), tenant: form.id, role: "owner" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setAssignNote(data.emailSent === false ? `✓ Invite created. Email failed, share: ${data.signUpUrl}` : `✓ ${data.message || "Invite sent"}`);
    } catch (err) {
      setAssignNote(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="rounded-2xl border border-glass-border bg-glass p-5 space-y-3">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-warm-white">Business info</h2>
        <Field label="Site name" value={form.siteName} onChange={(v) => setForm({ ...form, siteName: v })} />
        <Field label="Owner name" value={form.ownerName} onChange={(v) => setForm({ ...form, ownerName: v })} />
        <Field label="Owner email" value={form.ownerEmail} onChange={(v) => setForm({ ...form, ownerEmail: v })} />
        <Field label="Owner phone" value={form.ownerPhone} onChange={(v) => setForm({ ...form, ownerPhone: v })} />
        <Field label="Referred by" value={form.referredBy} onChange={(v) => setForm({ ...form, referredBy: v })} />
        <Field label="Booking provider" value={form.bookingProvider} onChange={(v) => setForm({ ...form, bookingProvider: v })} placeholder="Vagaro, Calendly…" />
        <Field label="Booking URL" value={form.bookingUrl} onChange={(v) => setForm({ ...form, bookingUrl: v })} placeholder="https://…" />
        <Field label="Production domain" value={form.productionDomain} onChange={(v) => setForm({ ...form, productionDomain: v })} />
        <Field label="Admin domain" value={form.adminDomain} onChange={(v) => setForm({ ...form, adminDomain: v })} />
        <div className="space-y-1.5">
          <label className="flex items-center gap-2 text-sm text-gray-muted">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => {
                const next = e.target.checked;
                if (!next && form.active) {
                  // turning off — require explicit confirm
                  setConfirmDeactivate(true);
                } else {
                  setConfirmDeactivate(false);
                  setForm({ ...form, active: next });
                }
              }}
            />
            Active
          </label>
          {confirmDeactivate && (
            <div className="rounded-md border border-critical0/25 bg-critical0/10 px-3 py-2 space-y-2">
              <p className="text-xs text-critical leading-snug">
                Deactivating hides the client dashboard, removes them from the portfolio, and stops all report crons. Are you sure?
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setForm({ ...form, active: false });
                    setConfirmDeactivate(false);
                  }}
                  className="rounded-md border border-critical0/25 bg-critical0/10 px-2.5 py-1 text-[11px] text-critical hover:bg-critical0/20"
                >
                  Yes, deactivate
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeactivate(false)}
                  className="rounded-md px-2 py-1 text-[11px] text-gray-muted hover:text-warm-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
        <p className="text-xs text-gray-faint">
          Revalidation secret: {form.hasRevalidationSecret ? "set" : "missing"}
          {form.revalidateUrl ? ` · ${form.revalidateUrl}` : ""}
        </p>
        {error && <p className="text-sm text-critical">{error}</p>}
        <button
          onClick={() => void save()}
          disabled={saving}
          className="rounded-md bg-accent text-on-accent px-4 py-2 text-sm font-medium disabled:opacity-40"
        >
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save changes"}
        </button>
      </div>

      <div className="rounded-2xl border border-glass-border bg-glass p-5 space-y-3 self-start">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-warm-white">Grant access</h2>

        {/* Current members */}
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-[0.08em] text-gray-faint">Current members</p>
          {membersLoading ? (
            <p className="text-xs text-gray-faint">Loading…</p>
          ) : members.length === 0 ? (
            <p className="text-xs text-gray-faint">No members yet.</p>
          ) : (
            <ul className="space-y-1">
              {members.map((m) => (
                <li key={m.userId} className="flex items-center justify-between gap-2 rounded-md bg-surface-base/40 px-2.5 py-1.5">
                  <div className="min-w-0">
                    <span className="block truncate text-xs text-warm-white">{m.email}</span>
                    <span className="text-[11px] text-gray-faint">{m.role}</span>
                  </div>
                  {confirmRevokeId === m.userId ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => void revoke(m.userId)}
                        disabled={revokingId === m.userId}
                        className="rounded-md border border-critical0/25 bg-critical0/10 px-2 py-0.5 text-[11px] text-critical hover:bg-critical0/20 disabled:opacity-40"
                      >
                        {revokingId === m.userId ? "…" : "Confirm"}
                      </button>
                      <button
                        onClick={() => setConfirmRevokeId(null)}
                        className="rounded-md px-1.5 py-0.5 text-[11px] text-gray-muted hover:text-warm-white"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmRevokeId(m.userId)}
                      disabled={revokingId !== null}
                      className="shrink-0 rounded-md border border-critical0/25 px-2 py-0.5 text-[11px] text-critical hover:bg-critical0/10 disabled:opacity-40"
                    >
                      Revoke
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-glass-border pt-3">
        <Field label="Email" value={assignEmail} onChange={setAssignEmail} placeholder="owner@business.com" />
        <div>
          <label htmlFor={roleSelectId} className="block text-xs text-gray-muted mb-1">Role</label>
          <select
            id={roleSelectId}
            value={assignRole}
            onChange={(e) => setAssignRole(e.target.value as typeof assignRole)}
            className="w-full rounded-md bg-surface-base border border-glass-border px-3 py-2 text-sm text-warm-white focus:outline-none focus:border-accent/50"
          >
            {(["owner", "admin", "editor", "viewer"] as const).map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        {assignNote && (
          <p className={`text-sm ${assignNote.startsWith("✓") ? "text-positive" : "text-critical"}`}>
            {assignNote}
          </p>
        )}
        <button
          onClick={() => void assign()}
          disabled={assigning || !assignEmail.trim()}
          className="rounded-md border border-glass-border px-4 py-2 text-sm text-warm-white hover:bg-gray-bg disabled:opacity-40"
        >
          {assigning ? "Assigning…" : "Assign user"}
        </button>
        <p className="text-xs text-gray-faint">
          The user must already have an account (signed up with this exact email). Use Resend owner invite below if they don&apos;t.
        </p>

        <div className="pt-3 mt-1 border-t border-glass-border">
          <p className="text-xs text-gray-muted mb-2">
            Or (re)send the owner invite to{" "}
            <span className="text-warm-white">{form.ownerEmail || "—"}</span>. Works whether or
            not they have an account yet.
          </p>
          <button
            onClick={() => void resendOwnerInvite()}
            disabled={assigning || !form.ownerEmail.trim()}
            className="rounded-md border border-glass-border px-4 py-2 text-sm text-warm-white hover:bg-gray-bg disabled:opacity-40"
          >
            {assigning ? "Sending…" : "Resend owner invite"}
          </button>
        </div>
        </div>
      </div>
      </div>

      <FeaturesPanel
        features={form.features}
        onChange={(f) => setForm({ ...form, features: f })}
        onSave={() => void save()}
        saving={saving}
        saved={saved}
        error={error}
      />
    </div>
  );
}

function FeaturesPanel({
  features,
  onChange,
  onSave,
  saving,
  saved,
  error,
}: {
  features: string[];
  onChange: (features: string[]) => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
  error: string | null;
}) {
  const { core, sets } = getToggleableRegistry();
  const has = (id: string) => features.includes(id);
  const toggle = (id: string, on: boolean) => {
    onChange(on ? Array.from(new Set([...features, id])) : features.filter((f) => f !== id));
  };
  const toggleSet = (memberIds: string[], on: boolean) => {
    const next = new Set(features);
    for (const m of memberIds) {
      if (on) next.add(m);
      else next.delete(m);
    }
    onChange(Array.from(next));
  };

  return (
    <div className="rounded-2xl border border-glass-border bg-glass p-5 space-y-5">
      <div>
        <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-warm-white">Features</h2>
        <p className="text-xs text-gray-faint mt-1">Which dashboard tools this client sees. Not billing.</p>
      </div>

      <div className="space-y-2">
        <p className="text-[11px] uppercase tracking-[0.08em] text-gray-faint">Core · always on</p>
        {core.map((f) => (
          <div key={f.id} className="flex items-center justify-between">
            <span className="text-sm text-gray-muted">🔒 {f.label}</span>
            <Toggle checked disabled onChange={() => {}} size="sm" label={`${f.label} (core, locked)`} />
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <p className="text-[11px] uppercase tracking-[0.08em] text-gray-faint">Vertical sets</p>
        {sets.map((s) => {
          const memberIds = s.members.map((m) => m.id);
          const on = memberIds.some((m) => has(m));
          return (
            <div key={s.id} className="rounded-lg border border-glass-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-warm-white">{s.label} set</span>
                <Toggle checked={on} onChange={(v) => toggleSet(memberIds, v)} size="sm" label={`${s.label} set`} />
              </div>
              <p className="text-xs leading-relaxed text-gray-faint">{s.scope}</p>
              {on && s.members.length > 1 && (
                <div className="space-y-1.5 border-l border-glass-border pl-3">
                  {s.members.map((m) => (
                    <div key={m.id} className="flex items-center justify-between">
                      <span className="text-sm text-gray-muted">{m.label}</span>
                      <Toggle checked={has(m.id)} onChange={(v) => toggle(m.id, v)} size="sm" label={m.label} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-faint">
        Google Business &amp; Reviews appear automatically based on the client&apos;s business type and connections.
      </p>

      {error && <p className="text-sm text-critical">{error}</p>}
      <button
        onClick={onSave}
        disabled={saving}
        className="rounded-md bg-accent text-on-accent px-4 py-2 text-sm font-medium disabled:opacity-40"
      >
        {saving ? "Saving…" : saved ? "Saved ✓" : "Save features"}
      </button>
    </div>
  );
}

