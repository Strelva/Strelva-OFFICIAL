"use client";

import { useEffect, useState } from "react";

interface PayLink {
  slug: string;
  clientName: string;
  door: "build" | "managed";
  leadSlug?: string;
  amountCents?: number;
  createdAt?: string;
  createdBy?: string;
}

const blankForm = {
  slug: "",
  clientName: "",
  door: "build" as "build" | "managed",
  leadSlug: "",
  amountDollars: "",
};

export default function PayLinksPage() {
  const [links, setLinks] = useState<PayLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(blankForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/pay-links");
      const data = await res.json();
      setLinks(data.payLinks ?? []);
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-warm-white">Pay Links</h1>
        <p className="text-sm text-gray-muted mt-1">
          Mint a per-client payment link to send before work starts.
        </p>
      </div>

      <div className="rounded-xl bg-glass border border-glass-border p-5">
        <h2 className="text-sm font-semibold text-warm-white mb-4">New pay link</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Slug" value={form.slug} onChange={(v) => setForm({ ...form, slug: v })} placeholder="acme-coffee" />
          <Field label="Client name" value={form.clientName} onChange={(v) => setForm({ ...form, clientName: v })} placeholder="Acme Coffee" />
          <div>
            <label className="block text-xs text-gray-muted mb-1">Door</label>
            <select
              value={form.door}
              onChange={(e) => setForm({ ...form, door: e.target.value as "build" | "managed" })}
              className="w-full rounded-md bg-gray-bg border border-glass-border px-3 py-2 text-sm text-warm-white focus:outline-none focus:border-accent/50"
            >
              <option value="build">Build (one-time)</option>
              <option value="managed">Managed (start fee)</option>
            </select>
          </div>
          <Field label="Amount (USD)" value={form.amountDollars} onChange={(v) => setForm({ ...form, amountDollars: v })} placeholder="1500" type="number" />
          <Field label="Lead slug (optional)" value={form.leadSlug} onChange={(v) => setForm({ ...form, leadSlug: v })} placeholder="defaults to slug" />
        </div>
        {error && <p className="text-sm text-red-300 mt-3">{error}</p>}
        <button
          onClick={() => void submit()}
          disabled={submitting}
          className="mt-4 rounded-md bg-warm-white text-surface-base px-4 py-2 text-sm font-medium disabled:opacity-40"
        >
          {submitting ? "Minting…" : "Mint pay link"}
        </button>
      </div>

      <div className="rounded-xl bg-glass border border-glass-border overflow-hidden">
        <div className="px-5 py-4 border-b border-glass-border">
          <h2 className="text-sm font-semibold text-warm-white">
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
                  </p>
                  <p className="text-xs text-gray-muted truncate">
                    /pay/{l.slug}
                    {typeof l.amountCents === "number"
                      ? ` · $${(l.amountCents / 100).toLocaleString()}`
                      : ""}
                  </p>
                </div>
                <button
                  onClick={() => copyLink(l.slug)}
                  className="shrink-0 rounded-md border border-glass-border px-3 py-1 text-xs text-gray-muted hover:text-warm-white"
                >
                  {copied === l.slug ? "Copied" : "Copy URL"}
                </button>
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
