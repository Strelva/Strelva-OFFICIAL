"use client";

import { useRef, useState } from "react";
import { CreditCard, ExternalLink } from "lucide-react";

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

export function BillingPanel({
  tenantId,
  ownerEmail,
  initial,
  stripeCustomerId,
  stripeSubscriptionId,
}: {
  tenantId: string;
  ownerEmail: string;
  initial: {
    billingType: string;
    subscriptionPlan: string;
    customMonthlyDollars: string;
    subscriptionStatus: string;
  };
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
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

  // True while the generate fetch is in flight AND until any resulting state
  // has settled. A separate ref lets the handler bail early on concurrent calls
  // even if React has not yet re-rendered the disabled prop.
  const linkBusyRef = useRef(false);

  // Stripe portal
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  // Cancel subscription — two-step confirm
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelNote, setCancelNote] = useState<string | null>(null);
  const [cancelSuccess, setCancelSuccess] = useState(false);

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
          // subscriptionStatus intentionally omitted — it is Stripe-authoritative
          // and must only be written by the billing webhook, never the admin UI.
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
    // Concurrent-call guard: bail immediately if a request is already in flight.
    if (linkBusyRef.current) return;
    // If we already have a valid link, don't mint a second Stripe session — the
    // button will be hidden in this state, but guard here too for safety.
    if (linkUrl) return;
    if (!linkEmail.trim()) {
      setLinkNote("Enter the client's email first.");
      return;
    }
    linkBusyRef.current = true;
    setLinkNote(null);
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
      // Clear busy flag in finally so the button stays disabled for the entire
      // async lifecycle, including error paths.
      linkBusyRef.current = false;
      setLinkBusy(false);
    }
  }

  async function openStripePortal() {
    setPortalError(null);
    setPortalBusy(true);
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/billing-portal`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      window.open(data.portalUrl as string, "_blank", "noopener,noreferrer");
    } catch (err) {
      setPortalError(err instanceof Error ? err.message : "Could not open portal");
    } finally {
      setPortalBusy(false);
    }
  }

  async function cancelSubscription() {
    setCancelNote(null);
    setCancelBusy(true);
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/cancel-subscription`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      const until = data.cancelAt
        ? ` Access ends ${new Date(data.cancelAt as string).toLocaleDateString()}.`
        : "";
      setCancelNote(`Cancellation scheduled.${until}`);
      setCancelSuccess(true);
      setCancelConfirm(false);
    } catch (err) {
      setCancelNote(err instanceof Error ? err.message : "Cancel failed");
      setCancelSuccess(false);
    } finally {
      setCancelBusy(false);
    }
  }

  // Show Stripe controls only when the client has a real Stripe customer and
  // an active-ish subscription. Grandfathered / case-study / none clients have
  // no stripeCustomerId and should never see a portal or cancel button.
  const hasStripeCustomer = Boolean(stripeCustomerId);
  const hasStripeSub = Boolean(stripeSubscriptionId);
  const isActiveSubscription =
    form.subscriptionStatus === "active" ||
    form.subscriptionStatus === "trialing" ||
    form.subscriptionStatus === "past_due";

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
        <label className="block text-xs text-gray-muted mb-1">Stripe status</label>
        {/* Read-only: this value is authoritative — it gates dashboard access,
            report crons, and the active-subscription count. It is written only
            by the Stripe webhook (invoice.paid / invoice.payment_failed /
            customer.subscription.deleted). Hand-editing it would silently
            diverge from Stripe and could block or grant access incorrectly. */}
        <p className={`${inputCls} cursor-default select-text`}>{form.subscriptionStatus || "none"}</p>
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
          {/* Show generate button only when no link exists yet; once a link is
              minted, show copy/reset instead to prevent duplicate Stripe sessions. */}
          {!linkUrl ? (
            <button
              onClick={() => void generateBillingLink()}
              disabled={linkBusy}
              className="rounded-md border border-glass-border px-4 py-2 text-sm text-warm-white hover:bg-gray-bg disabled:opacity-40"
            >
              {linkBusy ? "Generating…" : "Generate billing link"}
            </button>
          ) : null}
          {linkNote && <p className="text-sm text-critical">{linkNote}</p>}
          {linkUrl && (
            <div className="space-y-1">
              <p className="text-xs text-positive">Send this to the client — they pay and it activates:</p>
              <div className="flex items-center gap-2">
                <input readOnly value={linkUrl} onFocus={(e) => e.currentTarget.select()} className="flex-1 rounded-md bg-gray-bg border border-glass-border px-3 py-2 text-xs text-warm-white" />
                <button onClick={() => void navigator.clipboard?.writeText(linkUrl)} className="rounded-md border border-glass-border px-3 py-2 text-xs text-warm-white hover:bg-gray-bg">Copy</button>
              </div>
              <button
                onClick={() => { setLinkUrl(null); setLinkNote(null); }}
                className="text-xs text-gray-muted hover:text-warm-white underline"
              >
                Generate a new link
              </button>
            </div>
          )}
        </div>
      )}

      {/* Stripe portal + cancel — only shown when the client has a real Stripe
          customer. Grandfathered, case-study, and unsubscribed clients have no
          stripeCustomerId and will never see these controls. */}
      {hasStripeCustomer && (
        <div className="pt-3 border-t border-glass-border space-y-3">
          <p className="text-xs text-gray-muted font-medium">Stripe account</p>

          <button
            onClick={() => void openStripePortal()}
            disabled={portalBusy}
            className="flex items-center gap-1.5 rounded-md border border-glass-border px-4 py-2 text-sm text-warm-white hover:bg-gray-bg disabled:opacity-40"
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0" strokeWidth={1.9} />
            {portalBusy ? "Opening…" : "Manage in Stripe portal"}
          </button>
          {portalError && <p className="text-sm text-critical">{portalError}</p>}

          {/* Cancel — only shown when there is an active subscription to cancel.
              Two-step: button → confirm row → fires the soft-cancel. */}
          {hasStripeSub && isActiveSubscription && (
            <div className="space-y-2">
              {!cancelConfirm ? (
                <button
                  onClick={() => { setCancelConfirm(true); setCancelNote(null); }}
                  className="text-xs text-gray-muted hover:text-critical underline"
                >
                  Cancel subscription
                </button>
              ) : (
                <div className="rounded-md border border-glass-border bg-surface-base p-3 space-y-2">
                  <p className="text-xs text-warm-white">
                    Set <span className="font-medium">cancel_at_period_end = true</span> in Stripe.
                    The client keeps access until the current period ends — no immediate cut-off.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => void cancelSubscription()}
                      disabled={cancelBusy}
                      className="rounded-md bg-critical/20 border border-critical/40 px-3 py-1.5 text-xs text-critical font-medium hover:bg-critical/30 disabled:opacity-40"
                    >
                      {cancelBusy ? "Cancelling…" : "Yes, schedule cancellation"}
                    </button>
                    <button
                      onClick={() => { setCancelConfirm(false); setCancelNote(null); }}
                      disabled={cancelBusy}
                      className="text-xs text-gray-muted hover:text-warm-white"
                    >
                      Never mind
                    </button>
                  </div>
                </div>
              )}
              {cancelNote && (
                <p className={`text-xs ${cancelSuccess ? "text-positive" : "text-critical"}`}>
                  {cancelNote}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
