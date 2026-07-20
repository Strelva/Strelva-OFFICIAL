"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { BillingType, CommercialPlanKey, PresenceProfile } from "@/lib/types";

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

// Full 20-vertical list — kept in sync with scripts/provision-tenant.ts VALID_INDUSTRIES
// and src/app/admin/CreateTenantForm.tsx INDUSTRIES.
const INDUSTRIES = [
  "wellness", "food-brand", "restaurant", "trades", "professional", "fashion-stylist",
  "medical", "ecommerce", "retail", "home-services", "automotive", "beauty",
  "fitness", "legal", "real-estate", "financial", "education", "hospitality",
  "pet-services", "nonprofit",
] as const;

const BILLING_TYPES: { value: BillingType | ""; label: string; hint: string }[] = [
  { value: "", label: "No plan set", hint: "Not configured yet — this flags as an open item." },
  { value: "tier", label: "Tier — on Strelva Stripe (Presence / Growth / Scale)", hint: "On one of the 3 published plans." },
  { value: "custom", label: "Custom / legacy — billed off-platform", hint: "Not on Strelva Stripe. Enter the monthly amount — it counts toward MRR." },
  { value: "case_study", label: "Case study (free)", hint: "Comped — no charge." },
];

const TIERS: { value: CommercialPlanKey; label: string }[] = [
  { value: "presence", label: "Presence · $99/mo" },
  { value: "growth", label: "Growth · $199/mo" },
  { value: "scale", label: "Scale · $499/mo" },
];

const PRESENCE_OPTIONS: { value: PresenceProfile; label: string; description: string }[] = [
  { value: "local", label: "Local business", description: "Has a physical location or serves customers in person (gets Google Business + Reviews surfaces)" },
  { value: "online", label: "Online only", description: "No physical location — ships products or serves remotely (skips local-SEO framing)" },
  { value: "hybrid", label: "Both", description: "Operates locally AND online" },
];

const blank = {
  subdomain: "",
  siteName: "",
  ownerName: "",
  ownerEmail: "",
  industry: "" as string,
  productionDomain: "",
  billingType: "" as BillingType | "",
  subscriptionPlan: "growth" as CommercialPlanKey,
  customMonthlyDollars: "",
  presence: "local" as PresenceProfile,
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

// The beacon check item text — must match what provisioning.ts emits so we can
// find it and elevate it as a critical alert.
const BEACON_SENTINEL = "CRITICAL:";

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
    if (!form.industry) {
      setError("Select an industry.");
      return;
    }
    if (!form.ownerEmail.trim()) {
      setError("Owner email is required.");
      return;
    }
    if (form.billingType === "custom" && !(parseFloat(form.customMonthlyDollars) > 0)) {
      setError("Enter the monthly amount for the custom plan.");
      return;
    }
    setRunning(true);
    try {
      const planMonthlyCents =
        form.billingType === "custom"
          ? Math.max(0, Math.round(parseFloat(form.customMonthlyDollars || "0") * 100))
          : undefined;

      const body = {
        subdomain: form.subdomain,
        siteName: form.siteName,
        ownerName: form.ownerName,
        ownerEmail: form.ownerEmail,
        industry: form.industry,
        productionDomain: form.productionDomain,
        billingType: form.billingType || undefined,
        subscriptionPlan: form.billingType === "tier" ? form.subscriptionPlan : undefined,
        planMonthlyCents: form.billingType === "custom" ? planMonthlyCents : undefined,
        presence: form.presence,
        ...(leadToken ? { leadToken } : {}),
      };

      const res = await fetch("/api/admin/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

  // Split manualNext into the critical beacon item and everything else.
  const beaconItem = result?.manualNext.find((n) => n.startsWith(BEACON_SENTINEL));
  const otherItems = result?.manualNext.filter((n) => !n.startsWith(BEACON_SENTINEL)) ?? [];

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="font-display text-[26px] sm:text-[30px] font-medium tracking-[-0.02em] text-warm-white">Onboard a client</h1>
        <p className="text-sm text-gray-muted mt-1">
          Automates the tenant record, revalidation secret, owner invite, and the Vercel
          project/env/domain. The site itself stays a hand-built repo you connect after.
        </p>
      </div>

      {!result && (
        <div className="rounded-2xl border border-glass-border bg-glass p-5 space-y-5">
          {/* Identity fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Subdomain *" value={form.subdomain} onChange={(v) => setForm({ ...form, subdomain: v })} placeholder="acme-hvac" />
            <Field label="Site name *" value={form.siteName} onChange={(v) => setForm({ ...form, siteName: v })} placeholder="Acme HVAC" />
            <Field label="Owner name *" value={form.ownerName} onChange={(v) => setForm({ ...form, ownerName: v })} placeholder="Jane Doe" />
            <div>
              <label className="block text-xs text-gray-muted mb-1">Owner email *</label>
              <input
                type="email"
                required
                value={form.ownerEmail}
                onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })}
                placeholder="jane@acmehvac.com"
                className="w-full rounded-md bg-gray-bg border border-glass-border px-3 py-2 text-sm text-warm-white placeholder:text-gray-faint focus:outline-none focus:border-accent/50"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-muted mb-1">Industry *</label>
              <select
                value={form.industry}
                required
                onChange={(e) => setForm({ ...form, industry: e.target.value })}
                className="w-full rounded-md bg-gray-bg border border-glass-border px-3 py-2 text-sm text-warm-white focus:outline-none focus:border-accent/50"
              >
                <option value="" disabled>Select industry…</option>
                {INDUSTRIES.map((i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
            </div>
            <Field label="Production domain (optional)" value={form.productionDomain} onChange={(v) => setForm({ ...form, productionDomain: v })} placeholder="acmehvac.com" />
          </div>

          {/* Presence */}
          <div>
            <p className="text-xs text-gray-muted mb-2">Presence *</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {PRESENCE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex flex-col gap-0.5 rounded-md border px-3 py-2.5 cursor-pointer transition-colors ${
                    form.presence === opt.value
                      ? "border-accent/50 bg-accent/5"
                      : "border-glass-border bg-gray-bg hover:border-glass-border/80"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="presence"
                      value={opt.value}
                      checked={form.presence === opt.value}
                      onChange={() => setForm({ ...form, presence: opt.value })}
                      className="accent-[var(--color-accent)]"
                    />
                    <span className="text-sm text-warm-white">{opt.label}</span>
                  </span>
                  <span className="text-xs text-gray-faint pl-5">{opt.description}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Billing */}
          <div className="space-y-3">
            <p className="text-xs text-gray-muted">Billing *</p>
            <div>
              <select
                value={form.billingType}
                onChange={(e) => setForm({ ...form, billingType: e.target.value as BillingType | "" })}
                className="w-full rounded-md bg-gray-bg border border-glass-border px-3 py-2 text-sm text-warm-white focus:outline-none focus:border-accent/50"
              >
                {BILLING_TYPES.map((bt) => (
                  <option key={bt.value} value={bt.value}>{bt.label}</option>
                ))}
              </select>
              {form.billingType && (
                <p className="text-xs text-gray-faint mt-1.5">
                  {BILLING_TYPES.find((bt) => bt.value === form.billingType)?.hint}
                </p>
              )}
            </div>

            {form.billingType === "tier" && (
              <div>
                <label className="block text-xs text-gray-muted mb-1">Tier</label>
                <select
                  value={form.subscriptionPlan}
                  onChange={(e) => setForm({ ...form, subscriptionPlan: e.target.value as CommercialPlanKey })}
                  className="w-full rounded-md bg-gray-bg border border-glass-border px-3 py-2 text-sm text-warm-white focus:outline-none focus:border-accent/50"
                >
                  {TIERS.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            )}

            {form.billingType === "custom" && (
              <div>
                <label className="block text-xs text-gray-muted mb-1">Monthly amount ($)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.customMonthlyDollars}
                  onChange={(e) => setForm({ ...form, customMonthlyDollars: e.target.value })}
                  placeholder="199"
                  className="w-full rounded-md bg-gray-bg border border-glass-border px-3 py-2 text-sm text-warm-white placeholder:text-gray-faint focus:outline-none focus:border-accent/50"
                />
              </div>
            )}
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

          {/* Beacon critical alert — elevated above the general "still needs a human" list
              because a site with no beacon = a permanently-dead dashboard. */}
          {beaconItem && (
            <div className="rounded-xl border border-critical0/40 bg-critical0/10 p-5">
              <h2 className="text-[15px] font-semibold text-critical mb-1.5">Critical — do this before handing over the dashboard</h2>
              <p className="text-sm text-critical/90">{beaconItem.replace(/^CRITICAL:\s*/i, "")}</p>
            </div>
          )}

          <div className="rounded-xl border border-warning0/25 bg-warning0/10 p-5">
            <h2 className="text-[15px] font-medium text-warning mb-3">Still needs a human</h2>
            <ul className="space-y-1.5">
              {otherItems.map((n, i) => (
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
