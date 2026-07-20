"use client";

import { useState } from "react";
import { CreditCard } from "lucide-react";

/**
 * The ONE billing surface for a client. Consolidates what used to be split across
 * StartPlanPanel + the TenantEditor billing section:
 *   - set the plan (tier / custom-off-platform / case-study / none)
 *   - see the current state
 *   - generate the recurring Stripe checkout link to send (tier clients only)
 */

const BILLING_TYPES: { value: string; label: string; hint: string }[] = [
  { value: "", label: "No plan set", hint: "Not configured yet — flags as an open item." },
  { value: "tier", label: "Tier — on Strelva Stripe", hint: "One of the 3 published plans. Send them a Stripe checkout link below." },
  { value: "custom", label: "Custom / legacy — billed off-platform", hint: "Not on Strelva Stripe (your invoice, their processor). Enter the monthly amount — counts toward MRR, no link needed." },
  { value: "case_study", label: "Case study (free)", hint: "Comped — no charge." },
];
const TIERS = [
  { value: "presence", label: "Presence · $99/mo" },
  { value: "growth", label: "Growth · $199/mo" },
  { value: "scale", label: "Scale · $499/mo" },
];
const SUB_STATUSES = ["none", "active", "trialing", "past_due", "cancelled"];

export function BillingPanel({
  tenantId,
  ownerEmail,
  initial,
}: {
  tenantId: string;
  ownerEmail: string;
  initial: {
    billingType: string;
    subscriptionPlan: string;
    customMonthlyDollars: string;
    subscriptionStatus: string;
  };
}) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Billing link generator
  const [linkEmail, setLinkEmail] = useState(ownerEmail || "");
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkNote, setLinkNote] = useState<string | null>(null);

  async function save() {
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/tenants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: tenantId,
          billingType: form.billingType,
          subscriptionPlan: form.billingType === "tier" ? form.subscriptionPlan || "growth" : "",
          planMonthlyCents:
            form.billingType === "custom"
              ? Math.max(0, Math.round(parseFloat(form.customMonthlyDollars || "0") * 100))
              : null,
          subscriptionStatus: form.subscriptionStatus,
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
          tenantId,
          customerEmail: linkEmail.trim(),
          plan: form.subscriptionPlan || "growth",
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

  const inputCls = "w-full rounded-md bg-surface-base border border-glass-border px-3 py-2 text-sm text-warm-white focus:outline-none focus:border-accent/50";

  return (
    <section className="rounded-2xl border border-glass-border bg-glass p-5 space-y-3">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-accent-dim text-accent">
          <CreditCard className="h-4 w-4" strokeWidth={1.9} />
        </span>
        <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-warm-white">Billing</h2>
      </div>

      <div>
        <label className="block text-xs text-gray-muted mb-1">Plan</label>
        <select value={form.billingType} onChange={(e) => setForm({ ...form, billingType: e.target.value })} className={inputCls}>
          {BILLING_TYPES.map((b) => (<option key={b.value || "none"} value={b.value}>{b.label}</option>))}
        </select>
        <p className="text-xs text-gray-faint mt-1">{BILLING_TYPES.find((b) => b.value === form.billingType)?.hint}</p>
      </div>

      {form.billingType === "tier" && (
        <div>
          <label className="block text-xs text-gray-muted mb-1">Tier</label>
          <select value={form.subscriptionPlan || "growth"} onChange={(e) => setForm({ ...form, subscriptionPlan: e.target.value })} className={inputCls}>
            {TIERS.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
          </select>
        </div>
      )}
      {form.billingType === "custom" && (
        <div>
          <label className="block text-xs text-gray-muted mb-1">Monthly amount (USD)</label>
          <input type="number" min="0" step="1" value={form.customMonthlyDollars} onChange={(e) => setForm({ ...form, customMonthlyDollars: e.target.value })} placeholder="185"
            className="w-full rounded-md bg-gray-bg border border-glass-border px-3 py-2 text-sm text-warm-white placeholder:text-gray-faint focus:outline-none focus:border-accent/50" />
        </div>
      )}

      <div>
        <label className="block text-xs text-gray-muted mb-1">Stripe status (informational)</label>
        <select value={form.subscriptionStatus} onChange={(e) => setForm({ ...form, subscriptionStatus: e.target.value })} className={inputCls}>
          {SUB_STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={() => void save()} disabled={saving} className="rounded-md bg-accent text-on-accent px-4 py-2 text-sm font-medium disabled:opacity-40">
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save billing"}
        </button>
        {error && <span className="text-sm text-critical">{error}</span>}
      </div>

      {form.billingType === "custom" && (
        <p className="text-xs text-gray-faint pt-1">Billed off-platform — the amount above is recorded for MRR only. No Stripe link.</p>
      )}

      {form.billingType === "tier" && (
        <div className="pt-3 border-t border-glass-border space-y-2">
          <p className="text-xs text-gray-muted">Send the client their recurring Stripe checkout link</p>
          <div>
            <label className="block text-xs text-gray-muted mb-1">Client email (for the checkout)</label>
            <input value={linkEmail} onChange={(e) => setLinkEmail(e.target.value)} placeholder="owner@business.com"
              className="w-full rounded-md bg-gray-bg border border-glass-border px-3 py-2 text-sm text-warm-white placeholder:text-gray-faint focus:outline-none focus:border-accent/50" />
          </div>
          <button onClick={() => void generateBillingLink()} disabled={linkBusy} className="rounded-md border border-glass-border px-4 py-2 text-sm text-warm-white hover:bg-gray-bg disabled:opacity-40">
            {linkBusy ? "Generating…" : "Generate billing link"}
          </button>
          {linkNote && <p className="text-sm text-critical">{linkNote}</p>}
          {linkUrl && (
            <div className="space-y-1">
              <p className="text-xs text-positive">Send this to the client — they pay and it activates:</p>
              <div className="flex items-center gap-2">
                <input readOnly value={linkUrl} onFocus={(e) => e.currentTarget.select()} className="flex-1 rounded-md bg-gray-bg border border-glass-border px-3 py-2 text-xs text-warm-white" />
                <button onClick={() => void navigator.clipboard?.writeText(linkUrl)} className="rounded-md border border-glass-border px-3 py-2 text-xs text-warm-white hover:bg-gray-bg">Copy</button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
