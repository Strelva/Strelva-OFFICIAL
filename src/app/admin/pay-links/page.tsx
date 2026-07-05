"use client";

import { useEffect, useState } from "react";

type Door = "build" | "managed_start";

interface PayLink {
  slug: string;
  clientName: string;
  door: Door;
  leadSlug?: string;
  amountCents?: number;
  createdAt?: string;
  createdBy?: string;
}

const blankForm = {
  slug: "",
  clientName: "",
  door: "build" as Door,
  leadSlug: "",
  amountDollars: "",
};

export default function PayLinksPage() {
  const [links, setLinks] = useState<PayLink[]>([]);
  const [paidSlugs, setPaidSlugs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(blankForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmingRevoke, setConfirmingRevoke] = useState<string | null>(null);

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
    const amountDollars = Number(form.amountDollars);
    if (!form.slug.trim() || !form.clientName.trim() || !amountDollars) {
      setError("Slug, client name, and amount are required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/pay-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: form.slug.trim(),
          clientName: form.clientName.trim(),
          door: form.door,
          leadSlug: form.leadSlug.trim() || form.slug.trim(),
          amountCents: Math.round(amountDollars * 100),
        }),
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
        <h1 className="font-[family-name:var(--font-display)] text-[28px] sm:text-[32px] font-medium text-warm-white">Pay Links</h1>
        <p className="text-sm text-gray-muted mt-1">
          Mint a per-client payment link to send before work starts.
        </p>
      </div>

      <div className="rounded-xl bg-glass border border-glass-border p-5">
        <h2 className="text-[15px] font-medium text-warm-white mb-4">New pay link</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Slug" value={form.slug} onChange={(v) => setForm({ ...form, slug: v })} placeholder="acme-coffee" />
          <Field label="Client name" value={form.clientName} onChange={(v) => setForm({ ...form, clientName: v })} placeholder="Acme Coffee" />
          <div>
            <label className="block text-xs text-gray-muted mb-1">Door</label>
            <select
              value={form.door}
              onChange={(e) => setForm({ ...form, door: e.target.value as Door })}
              className="w-full rounded-md bg-gray-bg border border-glass-border px-3 py-2 text-sm text-warm-white focus:outline-none focus:border-accent/50"
            >
              <option value="build">Build (one-time)</option>
              <option value="managed_start">Managed (start fee)</option>
            </select>
          </div>
          <Field label="Amount (USD)" value={form.amountDollars} onChange={(v) => setForm({ ...form, amountDollars: v })} placeholder="1500" type="number" />
          <Field label="Lead slug (optional)" value={form.leadSlug} onChange={(v) => setForm({ ...form, leadSlug: v })} placeholder="defaults to slug" />
        </div>
        {error && <p className="text-sm text-red-300 mt-3">{error}</p>}
        <button
          onClick={() => void submit()}
          disabled={submitting}
          className="mt-4 rounded-md bg-accent text-on-accent px-4 py-2 text-sm font-medium disabled:opacity-40"
        >
          {submitting ? "Minting…" : "Mint pay link"}
        </button>
      </div>

      <div className="rounded-xl bg-glass border border-glass-border overflow-hidden">
        <div className="px-5 py-4 border-b border-glass-border">
          <h2 className="text-[15px] font-medium text-warm-white">
            Outstanding links {links.length > 0 && <span className="text-gray-muted">({links.length})</span>}
          </h2>
        </div>
        {loading ? (
          <p className="px-5 py-6 text-sm text-gray-muted">Loading…</p>
        ) : links.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-muted">No pay links yet.</p>
        ) : (
          <ul className="divide-y divide-glass-border">
            {links.map((l) => (
              <li key={l.slug} className="px-5 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-warm-white truncate">
                    {l.clientName}{" "}
                    <span className="text-gray-faint">· {l.door}</span>
                    {paidSlugs.has(l.slug) && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                        Paid
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-muted truncate">
                    /pay/{l.slug}
                    {typeof l.amountCents === "number"
                      ? ` · $${(l.amountCents / 100).toLocaleString()}`
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
                        className="rounded-md border border-red-500/25 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-200 hover:bg-red-500/20"
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
                      className="rounded-md border border-red-500/25 px-3 py-1 text-xs text-red-300 hover:bg-red-500/10"
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
