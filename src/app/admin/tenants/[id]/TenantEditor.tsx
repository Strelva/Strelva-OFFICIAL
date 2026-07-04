"use client";

import { useState } from "react";

interface EditableTenant {
  id: string;
  siteName: string;
  ownerName: string;
  ownerEmail: string;
  productionDomain: string;
  adminDomain: string;
  subscriptionStatus: string;
  planOverride: string;
  active: boolean;
  revalidateUrl: string;
  hasRevalidationSecret: boolean;
}

const SUB_STATUSES = ["none", "active", "trialing", "past_due", "cancelled"];

export function TenantEditor({ tenant }: { tenant: EditableTenant }) {
  const [form, setForm] = useState(tenant);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Assign-user form
  const [assignEmail, setAssignEmail] = useState("");
  const [assignRole, setAssignRole] = useState<"owner" | "admin" | "editor" | "viewer">("owner");
  const [assigning, setAssigning] = useState(false);
  const [assignNote, setAssignNote] = useState<string | null>(null);

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
          productionDomain: form.productionDomain || undefined,
          adminDomain: form.adminDomain || undefined,
          subscriptionStatus: form.subscriptionStatus,
          // Send the raw value (incl. "") so un-checking founder-comp actually
          // clears it. `|| undefined` stripped the empty string from the body,
          // so the row never got written back to "" and the comp never lifted.
          planOverride: form.planOverride,
          active: form.active,
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
    } catch (err) {
      setAssignNote(err instanceof Error ? err.message : "Assign failed");
    } finally {
      setAssigning(false);
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
      setAssignNote(data.emailSent === false ? `✓ Invite created — email failed, share: ${data.signUpUrl}` : `✓ ${data.message || "Invite sent"}`);
    } catch (err) {
      setAssignNote(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="rounded-xl bg-glass border border-glass-border p-5 space-y-3">
        <h2 className="text-sm font-semibold text-warm-white">Tenant config</h2>
        <Field label="Site name" value={form.siteName} onChange={(v) => setForm({ ...form, siteName: v })} />
        <Field label="Owner name" value={form.ownerName} onChange={(v) => setForm({ ...form, ownerName: v })} />
        <Field label="Owner email" value={form.ownerEmail} onChange={(v) => setForm({ ...form, ownerEmail: v })} />
        <Field label="Production domain" value={form.productionDomain} onChange={(v) => setForm({ ...form, productionDomain: v })} />
        <Field label="Admin domain" value={form.adminDomain} onChange={(v) => setForm({ ...form, adminDomain: v })} />
        <div>
          <label className="block text-xs text-gray-muted mb-1">Subscription status</label>
          <select
            value={form.subscriptionStatus}
            onChange={(e) => setForm({ ...form, subscriptionStatus: e.target.value })}
            className="w-full rounded-md bg-surface-base border border-glass-border px-3 py-2 text-sm text-warm-white focus:outline-none focus:border-accent/50"
          >
            {SUB_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-muted">
          <input
            type="checkbox"
            checked={form.planOverride === "founder_comp"}
            onChange={(e) => setForm({ ...form, planOverride: e.target.checked ? "founder_comp" : "" })}
          />
          Founder-comp (free access)
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-muted">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
          Active
        </label>
        <p className="text-xs text-gray-faint">
          Revalidation secret: {form.hasRevalidationSecret ? "set" : "missing"}
          {form.revalidateUrl ? ` · ${form.revalidateUrl}` : ""}
        </p>
        {error && <p className="text-sm text-red-300">{error}</p>}
        <button
          onClick={() => void save()}
          disabled={saving}
          className="rounded-md bg-warm-white text-surface-base px-4 py-2 text-sm font-medium disabled:opacity-40"
        >
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save changes"}
        </button>
      </div>

      <div className="rounded-xl bg-glass border border-glass-border p-5 space-y-3 self-start">
        <h2 className="text-sm font-semibold text-warm-white">Grant access</h2>
        <Field label="Email" value={assignEmail} onChange={setAssignEmail} placeholder="owner@business.com" />
        <div>
          <label className="block text-xs text-gray-muted mb-1">Role</label>
          <select
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
          <p className={`text-sm ${assignNote.startsWith("✓") ? "text-emerald-300" : "text-red-300"}`}>
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
          The user must already have an account (signed up with this exact email) — use Resend owner invite below if they don&apos;t.
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
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-muted mb-1">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md bg-gray-bg border border-glass-border px-3 py-2 text-sm text-warm-white placeholder:text-gray-faint focus:outline-none focus:border-accent/50"
      />
    </div>
  );
}
