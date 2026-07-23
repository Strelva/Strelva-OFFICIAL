"use client";

import { useState, useEffect, useCallback, useId } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
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

  // Rename slug
  const [newSlug, setNewSlug] = useState("");
  const [renameConfirm, setRenameConfirm] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  // Rotate revalidation secret
  const [rotateConfirm, setRotateConfirm] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [rotateError, setRotateError] = useState<string | null>(null);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);

  // Deprovision
  const [deprovisionSlug, setDeprovisionSlug] = useState("");
  const [deprovisioning, setDeprovisioning] = useState(false);
  const [deprovisionError, setDeprovisionError] = useState<string | null>(null);

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

  async function rename() {
    setRenameError(null);
    setRenaming(true);
    try {
      const res = await fetch(`/api/admin/tenants/${tenant.id}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newSlug: newSlug.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      router.push(`/admin/clients/${newSlug.trim()}`);
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setRenaming(false);
      setRenameConfirm(false);
    }
  }

  async function rotateSecret() {
    setRotateError(null);
    setRotating(true);
    setRevealedSecret(null);
    try {
      const res = await fetch(`/api/admin/tenants/${tenant.id}/deprovision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rotate-secret" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setRevealedSecret((data as { newSecret: string }).newSecret);
      setRotateConfirm(false);
    } catch (err) {
      setRotateError(err instanceof Error ? err.message : "Rotate failed");
    } finally {
      setRotating(false);
    }
  }

  async function deprovision() {
    setDeprovisionError(null);
    setDeprovisioning(true);
    try {
      const res = await fetch(`/api/admin/tenants/${tenant.id}/deprovision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmSlug: tenant.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      router.push("/admin/clients");
    } catch (err) {
      setDeprovisionError(err instanceof Error ? err.message : "Deprovision failed");
    } finally {
      setDeprovisioning(false);
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
        {/* Wire-level / infrastructure controls (revalidation secret + slug
            rename) live under a collapsed "Advanced" toggle so Business info
            stays the everyday human-facts card, not a place a routine phone-number
            edit scrolls past a destructive rename. */}
        <details className="rounded-md border border-glass-border/60 bg-surface-base/20">
          <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-faint [&::-webkit-details-marker]:hidden">
            Advanced · infrastructure
          </summary>
          <div className="space-y-3 p-3 pt-0">
        <p className="text-xs text-gray-faint">
          Revalidation secret: {form.hasRevalidationSecret ? "set" : "missing"}
          {form.revalidateUrl ? ` · ${form.revalidateUrl}` : ""}
        </p>

        {/* Rotate revalidation secret */}
        <div className="space-y-1.5">
          {revealedSecret ? (
            <div className="rounded-md border border-glass-border bg-surface-base/40 p-3 space-y-2">
              <p className="text-xs text-gray-muted">
                New secret — copy it now. It will not be shown again. Hand it to Jacob to update the client repo env.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-surface-base px-2 py-1 text-xs font-mono text-warm-white break-all select-all">
                  {revealedSecret}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(revealedSecret);
                    setSecretCopied(true);
                    setTimeout(() => setSecretCopied(false), 2000);
                  }}
                  className="shrink-0 rounded-md border border-glass-border px-2.5 py-1 text-[11px] text-warm-white hover:bg-gray-bg"
                >
                  {secretCopied ? "Copied ✓" : "Copy"}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setRevealedSecret(null)}
                className="rounded-md px-2 py-1 text-[11px] text-gray-muted hover:text-warm-white"
              >
                Dismiss
              </button>
            </div>
          ) : rotateConfirm ? (
            <div className="rounded-md border border-warning/25 bg-warning/10 px-3 py-2 space-y-2">
              <p className="text-xs text-warning leading-snug">
                This invalidates the current revalidation secret immediately. The client site will stop accepting revalidation requests until Jacob updates its env var. Proceed?
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void rotateSecret()}
                  disabled={rotating}
                  className="rounded-md border border-warning/25 bg-warning/10 px-2.5 py-1 text-[11px] text-warning hover:bg-warning/20 disabled:opacity-40"
                >
                  {rotating ? "Rotating…" : "Yes, rotate"}
                </button>
                <button
                  type="button"
                  onClick={() => setRotateConfirm(false)}
                  className="rounded-md px-2 py-1 text-[11px] text-gray-muted hover:text-warm-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setRotateConfirm(true)}
              className="rounded-md border border-glass-border px-3 py-1.5 text-xs text-gray-muted hover:text-warm-white hover:bg-gray-bg"
            >
              Rotate revalidation secret
            </button>
          )}
          {rotateError && <p className="text-xs text-critical">{rotateError}</p>}
        </div>

        {/* Rename slug */}
        <div className="space-y-1.5 pt-1">
          <p className="text-[11px] uppercase tracking-[0.08em] text-gray-faint">Rename slug</p>
          <Field
            label="New slug"
            value={newSlug}
            onChange={(v) => {
              setNewSlug(v);
              setRenameConfirm(false);
              setRenameError(null);
            }}
            placeholder={tenant.id}
          />
          {renameConfirm ? (
            <div className="rounded-md border border-warning/25 bg-warning/10 px-3 py-2 space-y-2">
              <p className="text-xs text-warning leading-snug">
                Renaming cascades to all 35 child tables and rekeyes every authoritative Redis store. The tenant URL will change to <span className="font-mono">/admin/clients/{newSlug.trim() || "…"}</span>. This cannot be undone without another rename.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void rename()}
                  disabled={renaming}
                  className="rounded-md border border-warning/25 bg-warning/10 px-2.5 py-1 text-[11px] text-warning hover:bg-warning/20 disabled:opacity-40"
                >
                  {renaming ? "Renaming…" : "Yes, rename"}
                </button>
                <button
                  type="button"
                  onClick={() => setRenameConfirm(false)}
                  className="rounded-md px-2 py-1 text-[11px] text-gray-muted hover:text-warm-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setRenameConfirm(true)}
              disabled={!newSlug.trim() || newSlug.trim() === tenant.id}
              className="rounded-md border border-glass-border px-3 py-1.5 text-xs text-gray-muted hover:text-warm-white hover:bg-gray-bg disabled:opacity-40"
            >
              Rename
            </button>
          )}
          {renameError && <p className="text-xs text-critical">{renameError}</p>}
        </div>
          </div>
        </details>

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
                    <span className="text-[11px] text-gray-faint">{m.role.charAt(0).toUpperCase() + m.role.slice(1)}</span>
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
              <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
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
          Use this only if the person already has an account (signed up with this exact email). Otherwise use <b className="font-medium text-gray-muted">Send owner invite</b> below.
        </p>

        <div className="pt-3 mt-1 border-t border-glass-border">
          <p className="text-xs text-gray-muted mb-2">
            Send the owner invite to{" "}
            <span className="text-warm-white">{form.ownerEmail || "—"}</span>. Works whether or
            not they have an account yet — safe to resend if they didn&apos;t get it.
          </p>
          <button
            onClick={() => void resendOwnerInvite()}
            disabled={assigning || !form.ownerEmail.trim()}
            className="rounded-md border border-glass-border px-4 py-2 text-sm text-warm-white hover:bg-gray-bg disabled:opacity-40"
          >
            {assigning ? "Sending…" : "Send owner invite"}
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

      {/* Danger zone */}
      <div className="rounded-2xl border border-critical0/30 bg-critical0/5 p-5 space-y-4">
        <div>
          <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-critical">Danger zone — deprovision tenant</h2>
          <p className="text-xs text-gray-muted mt-1 leading-relaxed">
            Permanently purges all data across 35 Postgres tables, clears all Redis keys and domain claims, and deletes the Vercel project. This is irreversible. Protected tenants (gldf, rohlax) and tenants with an active subscription or build payments will be refused.
          </p>
        </div>
        <div className="space-y-2">
          <label className="block text-xs text-gray-muted">
            Type <span className="font-mono text-warm-white">{tenant.id}</span> to confirm
          </label>
          <input
            type="text"
            value={deprovisionSlug}
            onChange={(e) => {
              setDeprovisionSlug(e.target.value);
              setDeprovisionError(null);
            }}
            placeholder={tenant.id}
            className="w-full rounded-md bg-surface-base border border-glass-border px-3 py-2 text-sm font-mono text-warm-white placeholder:text-gray-faint focus:outline-none focus:border-critical0/50"
          />
          {deprovisionError && (
            <p className="text-xs text-critical leading-snug">{deprovisionError}</p>
          )}
          <button
            type="button"
            onClick={() => void deprovision()}
            disabled={deprovisionSlug !== tenant.id || deprovisioning}
            className="rounded-md border border-critical0/40 bg-critical0/10 px-4 py-2 text-sm font-medium text-critical hover:bg-critical0/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {deprovisioning ? "Deprovisioning…" : "Permanently delete this tenant"}
          </button>
        </div>
      </div>
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

