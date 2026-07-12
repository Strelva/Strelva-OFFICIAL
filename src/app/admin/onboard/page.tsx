"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

interface ProvisionStep {
  key: string;
  label: string;
  status: "ok" | "failed" | "skipped";
  detail?: string;
}

interface ProvisionResult {
  tenantId: string;
  siteUrl: string;
  steps: ProvisionStep[];
  manualNext: string[];
  clientEnv: Record<string, string>;
}

const INDUSTRIES = ["wellness", "food-brand", "restaurant", "trades", "professional", "fashion-stylist"];

const blank = {
  subdomain: "",
  siteName: "",
  ownerName: "",
  ownerEmail: "",
  industry: "trades",
  productionDomain: "",
};

const STATUS_DOT: Record<ProvisionStep["status"], string> = {
  ok: "text-positive",
  failed: "text-critical",
  skipped: "text-gray-faint",
};
const STATUS_MARK: Record<ProvisionStep["status"], string> = {
  ok: "✓",
  failed: "✕",
  skipped: "–",
};

export default function OnboardPage() {
  return (
    <Suspense fallback={null}>
      <OnboardForm />
    </Suspense>
  );
}

function OnboardForm() {
  // Optional prefill when handed off from the Leads console "Convert" action.
  const searchParams = useSearchParams();
  const [form, setForm] = useState(() => ({
    ...blank,
    siteName: searchParams.get("siteName") ?? "",
    ownerEmail: searchParams.get("ownerEmail") ?? "",
  }));
  // The lead being converted, if this onboard was opened from the Leads console.
  // Threaded to provision so a SUCCESSFUL provision flips the lead → "converted"
  // (an abandoned onboard leaves it "converting", never a phantom "converted").
  const leadToken = searchParams.get("leadToken") ?? "";
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProvisionResult | null>(null);
  const [copiedEnv, setCopiedEnv] = useState(false);

  function envText(env: Record<string, string>): string {
    return Object.entries(env)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
  }

  function copyEnv() {
    if (!result) return;
    void navigator.clipboard.writeText(envText(result.clientEnv));
    setCopiedEnv(true);
    setTimeout(() => setCopiedEnv(false), 1500);
  }

  async function run() {
    setError(null);
    setResult(null);
    if (!form.subdomain.trim() || !form.siteName.trim() || !form.ownerName.trim()) {
      setError("Subdomain, site name, and owner name are required.");
      return;
    }
    setRunning(true);
    try {
      const res = await fetch("/api/admin/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(leadToken ? { ...form, leadToken } : form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setResult(data as ProvisionResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Provisioning failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-[26px] sm:text-[30px] font-medium tracking-[-0.02em] text-warm-white">Onboard a client</h1>
        <p className="text-sm text-gray-muted mt-1">
          Automates the tenant record, revalidation secret, owner invite, and the Vercel
          project/env/domain. The site itself stays a hand-built repo you connect after.
        </p>
      </div>

      {!result && (
        <div className="rounded-2xl border border-glass-border bg-glass p-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Subdomain *" value={form.subdomain} onChange={(v) => setForm({ ...form, subdomain: v })} placeholder="acme-hvac" />
            <Field label="Site name *" value={form.siteName} onChange={(v) => setForm({ ...form, siteName: v })} placeholder="Acme HVAC" />
            <Field label="Owner name *" value={form.ownerName} onChange={(v) => setForm({ ...form, ownerName: v })} placeholder="Jane Doe" />
            <Field label="Owner email" value={form.ownerEmail} onChange={(v) => setForm({ ...form, ownerEmail: v })} placeholder="jane@acmehvac.com" />
            <div>
              <label className="block text-xs text-gray-muted mb-1">Industry</label>
              <select
                value={form.industry}
                onChange={(e) => setForm({ ...form, industry: e.target.value })}
                className="w-full rounded-md bg-gray-bg border border-glass-border px-3 py-2 text-sm text-warm-white focus:outline-none focus:border-accent/50"
              >
                {INDUSTRIES.map((i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
            </div>
            <Field label="Production domain (optional)" value={form.productionDomain} onChange={(v) => setForm({ ...form, productionDomain: v })} placeholder="acmehvac.com" />
          </div>
          {error && <p className="text-sm text-critical">{error}</p>}
          <button
            onClick={() => void run()}
            disabled={running}
            className="rounded-md bg-accent text-on-accent px-4 py-2 text-sm font-medium disabled:opacity-40"
          >
            {running ? "Provisioning…" : "Provision tenant"}
          </button>
        </div>
      )}

      {result && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-glass-border bg-glass p-5">
            <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-warm-white mb-3">
              {result.tenantId} · {result.siteUrl}
            </h2>
            <ul className="space-y-2">
              {result.steps.map((s) => (
                <li key={s.key} className="text-sm flex items-start gap-2">
                  <span className={STATUS_DOT[s.status]}>{STATUS_MARK[s.status]}</span>
                  <span className="text-warm-white">{s.label}</span>
                  {s.detail && <span className="text-gray-muted">: {s.detail}</span>}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-warning0/25 bg-warning0/10 p-5">
            <h2 className="text-[15px] font-medium text-warning mb-3">Still needs a human</h2>
            <ul className="space-y-1.5">
              {result.manualNext.map((n, i) => (
                <li key={i} className="text-sm text-warning/90">• {n}</li>
              ))}
            </ul>
          </div>

          {Object.keys(result.clientEnv).length > 0 && (
            <div className="rounded-2xl border border-glass-border bg-glass p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-warm-white">Client repo env</h2>
                <button
                  onClick={copyEnv}
                  className="rounded-md border border-glass-border px-3 py-1 text-xs text-gray-muted hover:text-warm-white"
                >
                  {copiedEnv ? "Copied" : "Copy all"}
                </button>
              </div>
              <pre className="text-xs text-gray-muted overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-surface-base p-3">
                {envText(result.clientEnv)}
              </pre>
              <p className="text-xs text-gray-faint mt-2">
                Paste into the hand-built {result.tenantId} repo. REVALIDATION_SECRET is the
                load-bearing one. (Already set on the Vercel project too.)
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <Link
              href={`/admin/clients/${result.tenantId}`}
              className="rounded-md bg-accent text-on-accent px-4 py-2 text-sm font-medium"
            >
              Open client
            </Link>
            <button
              onClick={() => {
                setResult(null);
                setForm(blank);
              }}
              className="rounded-md border border-glass-border px-4 py-2 text-sm text-warm-white hover:bg-gray-bg"
            >
              Onboard another
            </button>
          </div>
        </div>
      )}
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
