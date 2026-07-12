"use client";

import { useState } from "react";
import { Check, Copy, CreditCard, Loader2, ExternalLink } from "lucide-react";
import { Chip } from "../../console";

// Display-only tier list — price IDs stay server-side; we send the plan key.
const TIERS = [
  { key: "presence", label: "Presence", monthly: 99, blurb: "One-page site that drives the call." },
  { key: "growth", label: "Growth", monthly: 199, blurb: "Full site — book + buy." },
  { key: "scale", label: "Scale", monthly: 499, blurb: "Growth + managed content engine." },
] as const;

/**
 * Operator "Start plan" — pick a tier for this client and generate a live Stripe
 * checkout link to send them. Nothing charges until the client pays the link;
 * the webhook flips their status to active. Shows their current billing state.
 */
export function StartPlanPanel({
  tenantId,
  ownerEmail,
  subscriptionStatus,
}: {
  tenantId: string;
  ownerEmail: string;
  subscriptionStatus: string;
}) {
  const [plan, setPlan] = useState<string>("growth");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const active = subscriptionStatus === "active" || subscriptionStatus === "trialing";

  async function generate() {
    setBusy(true);
    setError("");
    setLink("");
    try {
      const res = await fetch("/api/billing/create-subscription", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId, customerEmail: ownerEmail, plan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't create the checkout link.");
      setLink(data.checkoutUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the checkout link.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copy failed — select the link above.");
    }
  }

  return (
    <section className="rounded-2xl border border-glass-border bg-glass p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-accent-dim text-accent">
          <CreditCard className="h-4 w-4" strokeWidth={1.9} />
        </span>
        <h2 className="text-[15px] font-medium text-warm-white">Start a plan</h2>
        {active ? <Chip tone="good">Subscribed</Chip> : <Chip tone="neutral">No plan</Chip>}
      </div>

      {active ? (
        <p className="text-[13px] text-gray-muted">
          This client has an active subscription. Manage it from their billing portal in Stripe.
        </p>
      ) : !ownerEmail ? (
        <p className="text-[13px] text-warning">
          Add an owner email to this client before you can send a checkout link.
        </p>
      ) : (
        <>
          <p className="mb-3 text-[12.5px] text-gray-muted">
            Pick a tier and generate a live checkout link to send {ownerEmail}. Nothing charges until they pay.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {TIERS.map((t) => {
              const on = plan === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setPlan(t.key)}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    on ? "border-accent/60 bg-accent-dim" : "border-glass-border bg-surface-base hover:border-gray-border"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold text-warm-white">{t.label}</span>
                    {on && <Check className="h-4 w-4 text-accent" strokeWidth={2.4} />}
                  </div>
                  <p className="mt-0.5 font-mono text-[13px] tabular-nums text-warm-white">${t.monthly}<span className="text-[11px] text-gray-muted">/mo</span></p>
                  <p className="mt-1 text-[11px] leading-snug text-gray-muted">{t.blurb}</p>
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={generate}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-on-accent transition-colors hover:bg-accent/90 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} /> : <CreditCard className="h-4 w-4" strokeWidth={1.9} />}
              Generate checkout link
            </button>
          </div>

          {link && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-glass-border bg-surface-base px-3 py-2">
              <a href={link} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate font-mono text-[12px] text-accent hover:underline">
                {link}
              </a>
              <button type="button" onClick={copy} className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-glass-border px-2.5 py-1 text-[12px] text-gray-muted transition-colors hover:text-warm-white">
                {copied ? <Check className="h-3.5 w-3.5 text-accent" strokeWidth={2.2} /> : <Copy className="h-3.5 w-3.5" strokeWidth={1.8} />}
                {copied ? "Copied" : "Copy"}
              </button>
              <a href={link} target="_blank" rel="noopener noreferrer" className="shrink-0 text-gray-muted hover:text-warm-white"><ExternalLink className="h-3.5 w-3.5" strokeWidth={1.8} /></a>
            </div>
          )}

          {error && <p className="mt-2 text-[12px] text-critical" role="alert">{error}</p>}
        </>
      )}
    </section>
  );
}
