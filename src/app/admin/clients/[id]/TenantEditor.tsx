"use client";

import { useState } from "react";
import { Toggle } from "@/components/ui/Toggle";
import { getToggleableRegistry } from "@/lib/features/registry";

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
  /** Operator-set billing classification: "" (none) | tier | custom | case_study. */
  billingType: string;
  /** When billingType==="tier": presence | growth | scale. */
  subscriptionPlan: string;
  /** When billingType==="custom": the monthly amount in dollars (UI), stored as cents. */
  customMonthlyDollars: string;
  /** Stripe subscription status (secondary — informational, set by the billing webhook). */
  subscriptionStatus: string;
  active: boolean;
  revalidateUrl: string;
  hasRevalidationSecret: boolean;
  /** Enabled dashboard features (see src/lib/features/registry.ts). */
  features: string[];
}

const SUB_STATUSES = ["none", "active", "trialing", "past_due", "cancelled"];
const BILLING_TYPES: { value: string; label: string; hint: string }[] = [
  { value: "", label: "No plan set", hint: "Not configured yet — this flags as an open item." },
  { value: "tier", label: "Tier — on Strelva Stripe (Presence / Growth / Scale)", hint: "On one of the 3 published plans. You can send them a Stripe checkout link below." },
  { value: "custom", label: "Custom / legacy — billed off-platform", hint: "Not on Strelva Stripe (legacy client, your invoice, their own processor). Enter the monthly amount — it counts toward MRR. No Stripe link needed." },
  { value: "case_study", label: "Case study (free)", hint: "Comped — no charge." },
];
const TIERS: { value: string; label: string }[] = [
  { value: "presence", label: "Presence · $99/mo" },
  { value: "growth", label: "Growth · $199/mo" },
  { value: "scale", label: "Scale · $499/mo" },
];

export function TenantEditor({ tenant }: { tenant: EditableTenant }) {
  const [form, setForm] = useState(tenant);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Billing checkout link generator
  const [linkEmail, setLinkEmail] = useState(tenant.ownerEmail || "");
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkNote, setLinkNote] = useState<string | null>(null);

  async function generateBillingLink() {
    setLinkNote(null);
    setLinkUrl(null);
    if (!linkEmail.trim()) {
      setLinkNote("Enter the client's email first.");
      return;
    }
    setLinkBusy(true);
    try {
      const res = await fetch("/api/billing/create-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: form.id,
          customerEmail: linkEmail.trim(),
          customerName: form.ownerName || undefined,
          plan: form.billingType === "tier" ? form.subscriptionPlan || "growth" : "growth",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setLinkUrl(data.checkoutUrl);
    } catch (err) {
      setLinkNote(err instanceof Error ? err.message : "Failed to generate link");
    } finally {
      setLinkBusy(false);
    }
  }

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
          ownerPhone: form.ownerPhone,
          referredBy: form.referredBy,
          bookingProvider: form.bookingProvider,
          bookingUrl: form.bookingUrl,
          productionDomain: form.productionDomain || undefined,
          adminDomain: form.adminDomain || undefined,
          // Billing: send the raw billingType (incl. "" for none) so clearing it persists.
          billingType: form.billingType,
          subscriptionPlan: form.billingType === "tier" ? form.subscriptionPlan || "growth" : "",
          planMonthlyCents:
            form.billingType === "custom"
              ? Math.max(0, Math.round(parseFloat(form.customMonthlyDollars || "0") * 100))
              : null,
          subscriptionStatus: form.subscriptionStatus,
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
        <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-warm-white">Tenant config</h2>
        <Field label="Site name" value={form.siteName} onChange={(v) => setForm({ ...form, siteName: v })} />
        <Field label="Owner name" value={form.ownerName} onChange={(v) => setForm({ ...form, ownerName: v })} />
        <Field label="Owner email" value={form.ownerEmail} onChange={(v) => setForm({ ...form, ownerEmail: v })} />
        <Field label="Owner phone" value={form.ownerPhone} onChange={(v) => setForm({ ...form, ownerPhone: v })} />
        <Field label="Referred by" value={form.referredBy} onChange={(v) => setForm({ ...form, referredBy: v })} />
        <Field label="Booking provider" value={form.bookingProvider} onChange={(v) => setForm({ ...form, bookingProvider: v })} placeholder="Vagaro, Calendly…" />
        <Field label="Booking URL" value={form.bookingUrl} onChange={(v) => setForm({ ...form, bookingUrl: v })} placeholder="https://…" />
        <Field label="Production domain" value={form.productionDomain} onChange={(v) => setForm({ ...form, productionDomain: v })} />
        <Field label="Admin domain" value={form.adminDomain} onChange={(v) => setForm({ ...form, adminDomain: v })} />
        <div className="rounded-lg border border-glass-border p-3 space-y-3">
          <p className="text-[11px] uppercase tracking-[0.08em] text-gray-faint">Billing</p>
          <div>
            <label className="block text-xs text-gray-muted mb-1">Plan</label>
            <select
              value={form.billingType}
              onChange={(e) => setForm({ ...form, billingType: e.target.value })}
              className="w-full rounded-md bg-surface-base border border-glass-border px-3 py-2 text-sm text-warm-white focus:outline-none focus:border-accent/50"
            >
              {BILLING_TYPES.map((b) => (
                <option key={b.value || "none"} value={b.value}>{b.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-faint mt-1">
              {BILLING_TYPES.find((b) => b.value === form.billingType)?.hint}
            </p>
          </div>
          {form.billingType === "tier" && (
            <div>
              <label className="block text-xs text-gray-muted mb-1">Tier</label>
              <select
                value={form.subscriptionPlan || "growth"}
                onChange={(e) => setForm({ ...form, subscriptionPlan: e.target.value })}
                className="w-full rounded-md bg-surface-base border border-glass-border px-3 py-2 text-sm text-warm-white focus:outline-none focus:border-accent/50"
              >
                {TIERS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          )}
          {form.billingType === "custom" && (
            <div>
              <label className="block text-xs text-gray-muted mb-1">Monthly amount (USD)</label>
              <input
                type="number"
                min="0"
                step="1"
                value={form.customMonthlyDollars}
                onChange={(e) => setForm({ ...form, customMonthlyDollars: e.target.value })}
                placeholder="185"
                className="w-full rounded-md bg-gray-bg border border-glass-border px-3 py-2 text-sm text-warm-white placeholder:text-gray-faint focus:outline-none focus:border-accent/50"
              />
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-muted mb-1">Stripe status (informational)</label>
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

          {form.billingType === "custom" && (
            <p className="text-xs text-gray-faint">
              Billed off-platform — no Strelva Stripe checkout. The amount above is recorded for MRR only.
            </p>
          )}

          {/* Billing link — Stripe subscription checkout, ONLY for on-Stripe tier clients. */}
          {form.billingType === "tier" && (
          <div className="pt-3 border-t border-glass-border space-y-2">
            <p className="text-xs text-gray-muted">Billing link to send the client (recurring Stripe checkout)</p>
            <Field label="Client email (for the checkout)" value={linkEmail} onChange={setLinkEmail} placeholder="owner@business.com" />
            <button
              onClick={() => void generateBillingLink()}
              disabled={linkBusy}
              className="rounded-md border border-glass-border px-4 py-2 text-sm text-warm-white hover:bg-gray-bg disabled:opacity-40"
            >
              {linkBusy ? "Generating…" : "Generate billing link"}
            </button>
            {linkNote && <p className="text-sm text-critical">{linkNote}</p>}
            {linkUrl && (
              <div className="space-y-1">
                <p className="text-xs text-positive">Send this to the client — they pay and it activates:</p>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={linkUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 rounded-md bg-gray-bg border border-glass-border px-3 py-2 text-xs text-warm-white"
                  />
                  <button
                    onClick={() => void navigator.clipboard?.writeText(linkUrl)}
                    className="rounded-md border border-glass-border px-3 py-2 text-xs text-warm-white hover:bg-gray-bg"
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}
          </div>
          )}
        </div>
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
