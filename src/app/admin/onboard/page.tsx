"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { BillingType, CommercialPlanKey, PresenceProfile } from "@/lib/types";

const PROVISION_STORAGE_KEY = "strelva:last-provision";

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

// Structured manualNext item format: "PHASE:key|Title|Detail"
// PHASE prefixes: DEPLOY | ANALYTICS | CRITICAL | LAUNCH
// The CRITICAL prefix means the item is load-bearing and gets a distinct callout row.
const ITEM_RE = /^(DEPLOY|ANALYTICS|CRITICAL|LAUNCH):(\w+)\|([^|]+)\|(.+)$/;

type ParsedItem = {
  phase: "DEPLOY" | "ANALYTICS" | "CRITICAL" | "LAUNCH";
  key: string;
  title: string;
  detail: string;
  raw: string;
};

function parseItem(raw: string): ParsedItem | null {
  const m = ITEM_RE.exec(raw);
  if (!m) return null;
  return {
    phase: m[1] as ParsedItem["phase"],
    key: m[2],
    title: m[3],
    detail: m[4],
    raw,
  };
}

const PHASE_META: Record<string, { label: string; order: number }> = {
  DEPLOY:    { label: "1 · Deploy the site",              order: 0 },
  CRITICAL:  { label: "2 · Wire up tracking & analytics", order: 1 },
  ANALYTICS: { label: "2 · Wire up tracking & analytics", order: 1 },
  LAUNCH:    { label: "3 · Launch",                       order: 2 },
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
  // true when result was restored from localStorage (not freshly provisioned this session)
  const [restoredFromStorage, setRestoredFromStorage] = useState(false);

  // Restore last provision result from localStorage on mount (client-only).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PROVISION_STORAGE_KEY);
      if (raw) {
        const stored = JSON.parse(raw) as ProvisionResult;
        if (stored?.tenantId) {
          setResult(stored);
          setRestoredFromStorage(true);
        }
      }
    } catch {
      // Corrupted entry — ignore.
    }
  }, []);

  function clearStoredResult() {
    try { localStorage.removeItem(PROVISION_STORAGE_KEY); } catch { /* ignore */ }
    setResult(null);
    setRestoredFromStorage(false);
  }

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
      const provisionResult = data as ProvisionResult;
      setResult(provisionResult);
      setRestoredFromStorage(false);
      try {
        localStorage.setItem(PROVISION_STORAGE_KEY, JSON.stringify(provisionResult));
      } catch {
        // Storage quota or private-mode — non-fatal.
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Provisioning failed");
    } finally {
      setRunning(false);
    }
  }

  // Parse and group manualNext items into ordered phases.
  const parsedItems: ParsedItem[] = (result?.manualNext ?? [])
    .map(parseItem)
    .filter((x): x is ParsedItem => x !== null);

  // Group into labelled phases, preserving order within each phase.
  // Phase order: DEPLOY (0) → ANALYTICS/CRITICAL (1) → LAUNCH (2)
  const phaseGroups: { label: string; order: number; items: ParsedItem[] }[] = [];
  for (const item of parsedItems) {
    const meta = PHASE_META[item.phase] ?? { label: item.phase, order: 99 };
    const existing = phaseGroups.find((g) => g.label === meta.label);
    if (existing) {
      existing.items.push(item);
    } else {
      phaseGroups.push({ label: meta.label, order: meta.order, items: [item] });
    }
  }
  phaseGroups.sort((a, b) => a.order - b.order);

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
                      className="sr-only"
                    />
                    {/* Custom sage ring instead of the native OS radio dot, to
                        match the styled inputs/selects on this form. */}
                    <span
                      aria-hidden
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
                        form.presence === opt.value ? "border-accent" : "border-gray-border"
                      }`}
                    >
                      {form.presence === opt.value && <span className="h-2 w-2 rounded-full bg-accent" />}
                    </span>
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
        <div className="space-y-4">
          {/* Restored-from-storage notice */}
          {restoredFromStorage && (
            <div className="flex items-center justify-between gap-4 rounded-xl border border-glass-border bg-glass px-4 py-3">
              <p className="text-xs text-gray-muted">
                Showing the last provisioned client —{" "}
                <span className="font-medium text-warm-white">{result.tenantId}</span>.
                Reload safe: this was restored from your browser.
              </p>
              <button
                onClick={clearStoredResult}
                className="shrink-0 rounded-md border border-glass-border px-3 py-1 text-xs text-gray-muted hover:text-warm-white transition-colors"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Success header */}
          <div className="rounded-2xl border border-glass-border bg-glass px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-positive mb-1">Provisioned</p>
                <h2 className="font-display text-[20px] font-medium tracking-[-0.02em] text-warm-white leading-tight">
                  {result.tenantId}
                </h2>
                <a
                  href={result.siteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-gray-muted hover:text-accent transition-colors"
                >
                  {result.siteUrl} ↗
                </a>
              </div>
              <Link
                href={`/admin/clients/${result.tenantId}`}
                className="shrink-0 rounded-md bg-accent text-on-accent px-3.5 py-1.5 text-sm font-medium"
              >
                Open client
              </Link>
            </div>

            {/* Completed steps — compact, secondary */}
            <details className="mt-4 group">
              <summary className="cursor-pointer text-xs text-gray-faint hover:text-gray-muted select-none list-none flex items-center gap-1.5">
                <span className="group-open:hidden">▶</span>
                <span className="hidden group-open:inline">▼</span>
                What provisioning did ({result.steps.filter((s) => s.status === "ok").length}/{result.steps.length} steps ok)
              </summary>
              <ul className="mt-2.5 space-y-1.5 pl-4">
                {result.steps.map((s) => (
                  <li key={s.key} className="text-xs flex items-start gap-2">
                    <span className={`${STATUS_DOT[s.status]} font-mono shrink-0`}>{STATUS_MARK[s.status]}</span>
                    <span className="text-gray-muted">{s.label}</span>
                    {s.detail && <span className="text-gray-faint">— {s.detail}</span>}
                  </li>
                ))}
              </ul>
            </details>
          </div>

          {/* Phased manual checklist */}
          {phaseGroups.length > 0 && (
            <div className="rounded-2xl border border-glass-border bg-glass overflow-hidden">
              <div className="px-5 pt-4 pb-3 border-b border-glass-border">
                <h2 className="text-[13.5px] font-semibold tracking-[-0.01em] text-warm-white">Your turn</h2>
                <p className="text-xs text-gray-muted mt-0.5">Complete these before handing over the dashboard.</p>
              </div>

              <div className="divide-y divide-glass-border">
                {phaseGroups.map((group) => (
                  <div key={group.label} className="px-5 py-3.5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-faint mb-2.5">{group.label}</p>
                    <ul className="space-y-2.5">
                      {group.items.map((item) => {
                        const isCritical = item.phase === "CRITICAL";
                        return (
                          <li
                            key={item.key}
                            className={`flex items-start gap-3 rounded-lg px-3 py-2.5 ${
                              isCritical
                                ? "bg-critical/8 border border-critical/20"
                                : "bg-white/[0.025]"
                            }`}
                          >
                            {/* Checkbox affordance */}
                            <span className={`mt-0.5 shrink-0 h-4 w-4 rounded border flex items-center justify-center ${
                              isCritical ? "border-critical/50" : "border-glass-border"
                            }`} aria-hidden="true" />
                            <div className="min-w-0">
                              <p className={`text-sm font-medium leading-snug ${isCritical ? "text-critical" : "text-warm-white"}`}>
                                {isCritical && (
                                  <span className="text-[10px] font-bold uppercase tracking-[0.1em] mr-1.5 align-middle">Critical</span>
                                )}
                                {item.title}
                              </p>
                              <p className={`text-xs mt-0.5 leading-relaxed ${isCritical ? "text-critical/70" : "text-gray-muted"}`}>
                                {item.detail}
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Env vars — collapsed by default, copy button inside */}
          {Object.keys(result.clientEnv).length > 0 && (
            <details className="rounded-2xl border border-glass-border bg-glass overflow-hidden group">
              <summary className="flex items-center justify-between gap-3 px-5 py-3.5 cursor-pointer list-none select-none hover:bg-white/[0.02] transition-colors">
                <span className="text-[13px] font-medium text-gray-muted group-open:text-warm-white transition-colors">
                  Repo env vars — paste into the {result.tenantId} repo
                </span>
                <span className="text-[10px] font-mono text-gray-faint group-open:hidden">
                  {Object.keys(result.clientEnv).length} vars ▶
                </span>
                <span className="text-[10px] font-mono text-gray-faint hidden group-open:inline">▼</span>
              </summary>
              <div className="border-t border-glass-border px-5 pb-4 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-gray-faint">
                    REVALIDATION_SECRET is load-bearing. Already set on the Vercel project.
                  </p>
                  <button
                    onClick={copyEnv}
                    className="shrink-0 rounded-md border border-glass-border px-3 py-1 text-xs text-gray-muted hover:text-warm-white transition-colors"
                  >
                    {copiedEnv ? "Copied" : "Copy all"}
                  </button>
                </div>
                <pre className="text-xs text-gray-muted overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-surface-base p-3 mt-1">
                  {envText(result.clientEnv)}
                </pre>
              </div>
            </details>
          )}

          <button
            onClick={() => {
              clearStoredResult();
              setForm(blank);
            }}
            className="rounded-md border border-glass-border px-4 py-2 text-sm text-warm-white hover:bg-gray-bg transition-colors"
          >
            Onboard another
          </button>
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
