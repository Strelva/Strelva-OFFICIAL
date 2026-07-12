"use client";

import { useEffect, useMemo, useState } from "react";

interface PayLink {
  slug: string;
  clientName: string;
  /** Retained on existing records (build | managed_start), no longer operator-facing. */
  door?: string;
  leadSlug?: string;
  amountCents?: number;
  minCents?: number;
  maxCents?: number;
  createdAt?: string;
  createdBy?: string;
}

type AmountMode = "fixed" | "range";

const blankForm = {
  slug: "",
  clientName: "",
  leadSlug: "",
  mode: "fixed" as AmountMode,
  amountDollars: "",
  minDollars: "",
  maxDollars: "",
};

function dollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

export default function PayLinksPage() {
  const [links, setLinks] = useState<PayLink[]>([]);
  const [paidSlugs, setPaidSlugs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(blankForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmingRevoke, setConfirmingRevoke] = useState<string | null>(null);

  // Revenue roll-up across the pay-link book. A link's face amount counts as
  // "collected" once a build payment converted it (its slug in paidSlugs), else
  // "outstanding". Range links carry no single figure, so they're left out of
  // the sum rather than guessed at.
  const rollup = useMemo(() => {
    let collected = 0;
    let outstanding = 0;
    for (const l of links) {
      if (typeof l.amountCents !== "number") continue;
      if (paidSlugs.has(l.slug)) collected += l.amountCents;
      else outstanding += l.amountCents;
    }
    return { collected, outstanding };
  }, [links, paidSlugs]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/pay-links");
      const data = await res.json();
      setLinks(data.payLinks ?? []);
      setPaidSlugs(new Set<string>(data.paidSlugs ?? []));
    } catch {
      setError("Failed to load pay links");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit() {
    setError(null);
    if (!form.slug.trim() || !form.clientName.trim()) {
      setError("Slug and client name are required.");
      return;
    }

    // The offer is "build" (a one-time charge) — the superseded managed-start
    // door is gone from the UI; the backend still keys its one-time payment
    // purpose off door:"build".
    const body: Record<string, unknown> = {
      slug: form.slug.trim(),
      clientName: form.clientName.trim(),
      door: "build",
      leadSlug: form.leadSlug.trim() || form.slug.trim(),
    };

    if (form.mode === "range") {
      const min = Number(form.minDollars);
      const max = Number(form.maxDollars);
      if (!min || !max) {
        setError("A range link needs both a minimum and a maximum amount.");
        return;
      }
      body.minCents = Math.round(min * 100);
      body.maxCents = Math.round(max * 100);
    } else {
      const amount = Number(form.amountDollars);
      if (!amount) {
        setError("An amount is required.");
        return;
      }
      body.amountCents = Math.round(amount * 100);
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/pay-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setForm(blankForm);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mint link");
    } finally {
      setSubmitting(false);
    }
  }

  function copyLink(slug: string) {
    const url = `${window.location.origin}/pay/${slug}`;
    void navigator.clipboard.writeText(url);
    setCopied(slug);
    setTimeout(() => setCopied(null), 1500);
  }

  async function revoke(slug: string) {
    setConfirmingRevoke(null);
    setError(null);
    try {
      const res = await fetch(`/api/admin/pay-links?slug=${encodeURIComponent(slug)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed (${res.status})`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revoke failed");
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-[26px] sm:text-[30px] font-medium tracking-[-0.02em] text-warm-white">Pay links</h1>
        <p className="text-sm text-gray-muted mt-1">
          Mint a payment link for a one-off charge: an occasional paid build or a one-time
          invoice. Monthly plans bill separately through Stripe.
        </p>
      </div>

      <div className="rounded-2xl border border-glass-border bg-glass p-5">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-warm-white mb-4">New payment link</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Slug" value={form.slug} onChange={(v) => setForm({ ...form, slug: v })} placeholder="acme-coffee" />
          <Field label="Client name" value={form.clientName} onChange={(v) => setForm({ ...form, clientName: v })} placeholder="Acme Coffee" />
          <div>
            <label className="block text-xs text-gray-muted mb-1">Amount type</label>
            <select
              value={form.mode}
              onChange={(e) => setForm({ ...form, mode: e.target.value as AmountMode })}
              className="w-full rounded-md bg-gray-bg border border-glass-border px-3 py-2 text-sm text-warm-white focus:outline-none focus:border-accent/50"
            >
              <option value="fixed">Fixed amount</option>
              <option value="range">Let them choose (range)</option>
            </select>
          </div>
          {form.mode === "range" ? (
            <>
              <Field label="Minimum (USD)" value={form.minDollars} onChange={(v) => setForm({ ...form, minDollars: v })} placeholder="500" type="number" />
              <Field label="Maximum (USD)" value={form.maxDollars} onChange={(v) => setForm({ ...form, maxDollars: v })} placeholder="2500" type="number" />
              <p className="sm:col-span-2 text-xs text-gray-faint">
                The client picks any amount in this range on a $50-step slider, so the span
                (max − min) must be a whole multiple of $50.
              </p>
            </>
          ) : (
            <Field label="Amount (USD)" value={form.amountDollars} onChange={(v) => setForm({ ...form, amountDollars: v })} placeholder="1500" type="number" />
          )}
          <Field label="Lead slug (optional)" value={form.leadSlug} onChange={(v) => setForm({ ...form, leadSlug: v })} placeholder="defaults to slug" />
        </div>
        {error && <p className="text-sm text-critical mt-3">{error}</p>}
        <button
          onClick={() => void submit()}
          disabled={submitting}
          className="mt-4 rounded-md bg-accent text-on-accent px-4 py-2 text-sm font-medium disabled:opacity-40"
        >
          {submitting ? "Minting…" : "Mint payment link"}
        </button>
      </div>

      <div className="rounded-2xl border border-glass-border bg-glass overflow-hidden">
        <div className="px-5 py-4 border-b border-glass-border flex items-center justify-between gap-4">
          <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-warm-white">
            Outstanding links {links.length > 0 && <span className="text-gray-muted">({links.length})</span>}
          </h2>
          {(rollup.collected > 0 || rollup.outstanding > 0) && (
            <p className="text-[13px] text-gray-muted shrink-0">
              <span className="text-positive">{dollars(rollup.collected)} collected</span>
              <span className="text-gray-faint"> · </span>
              <span className="text-warm-white">{dollars(rollup.outstanding)} outstanding</span>
            </p>
          )}
        </div>
        {loading ? (
          <p className="px-5 py-6 text-sm text-gray-muted">Loading…</p>
        ) : links.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-muted">No payment links yet.</p>
        ) : (
          <ul className="divide-y divide-glass-border">
            {links.map((l) => (
              <li key={l.slug} className="px-5 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-warm-white truncate">
                    {l.clientName}
                    {paidSlugs.has(l.slug) && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-positive0/15 px-2 py-0.5 text-[11px] font-medium text-positive">
                        Paid
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-muted truncate">
                    /pay/{l.slug}
                    {typeof l.amountCents === "number"
                      ? ` · ${dollars(l.amountCents)}`
                      : typeof l.minCents === "number" && typeof l.maxCents === "number"
                        ? ` · ${dollars(l.minCents)}–${dollars(l.maxCents)}`
                        : ""}
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <button
                    onClick={() => copyLink(l.slug)}
                    className="rounded-md border border-glass-border px-3 py-1 text-xs text-gray-muted hover:text-warm-white"
                  >
                    {copied === l.slug ? "Copied" : "Copy URL"}
                  </button>
                  {confirmingRevoke === l.slug ? (
                    <span className="inline-flex items-center gap-1.5">
                      <button
                        onClick={() => void revoke(l.slug)}
                        className="rounded-md border border-critical0/25 bg-critical0/10 px-3 py-1 text-xs font-medium text-critical hover:bg-critical0/20"
                      >
                        Confirm revoke
                      </button>
                      <button
                        onClick={() => setConfirmingRevoke(null)}
                        className="rounded-md px-2 py-1 text-xs text-gray-muted hover:text-warm-white"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmingRevoke(l.slug)}
                      className="rounded-md border border-critical0/25 px-3 py-1 text-xs text-critical hover:bg-critical0/10"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-muted mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md bg-gray-bg border border-glass-border px-3 py-2 text-sm text-warm-white placeholder:text-gray-faint focus:outline-none focus:border-accent/50"
      />
    </div>
  );
}
