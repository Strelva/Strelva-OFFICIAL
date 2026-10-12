"use client";
import { OPERATOR_DESTINATIONS } from "@/experience/operator/destinations";

import { useEffect, useState } from "react";
import { StEmpty, StField, StHead, StMono, StNotice, StPage, StPill, StPillLink, StRows, StRow, StSection, StSegmented, StState, StSteps, StSurface, StTextButton, StTextField } from "@/components/ui/strelva/Kit";
import { useSearchParams } from "next/navigation";
import type { BillingType, CommercialPlanKey, PresenceProfile } from "@/lib/types";

const PROVISION_STORAGE_KEY = "strelva:last-provision";

interface ProvisionStep {
  key: string;
  label: string;
  status: "ok" | "failed" | "skipped";
  detail?: string;
}

export interface ProvisionResult {
  tenantId: string;
  siteUrl: string;
  steps: ProvisionStep[];
  manualNext: string[];
  clientEnv: Record<string, string>;
}

// Full 20-vertical list — kept in sync with scripts/provision-tenant.ts VALID_INDUSTRIES.
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
    phase: m[1]! as ParsedItem["phase"],
    key: m[2]!,
    title: m[3]!,
    detail: m[4]!,
    raw,
  };
}

const PHASE_META: Record<string, { label: string; order: number }> = {
  DEPLOY:    { label: "1 · Deploy the site",              order: 0 },
  CRITICAL:  { label: "2 · Wire up tracking & analytics", order: 1 },
  ANALYTICS: { label: "2 · Wire up tracking & analytics", order: 1 },
  LAUNCH:    { label: "3 · Launch",                       order: 2 },
};

export function OnboardForm({ request = fetch, preview = false, initialResult = null }: { request?: typeof fetch; preview?: boolean; initialResult?: ProvisionResult | null }) {
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
  const [result, setResult] = useState<ProvisionResult | null>(initialResult);
  const [copiedEnv, setCopiedEnv] = useState(false);
  // true when result was restored from localStorage (not freshly provisioned this session)
  const [restoredFromStorage, setRestoredFromStorage] = useState(false);

  // Restore last provision result from localStorage on mount (client-only).
  useEffect(() => {
    if (preview) return;
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
  }, [preview]);

  function clearStoredResult() {
    try { if (!preview) localStorage.removeItem(PROVISION_STORAGE_KEY); } catch { /* ignore */ }
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

      const res = await request("/api/admin/provision", {
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
        if (!preview) localStorage.setItem(PROVISION_STORAGE_KEY, JSON.stringify(provisionResult));
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

  return <StPage>
    <StHead title={OPERATOR_DESTINATIONS.onboard.label} meta="Sets up the client record, owner invite and hosting. Connect the site’s repository afterwards." />
    {!result ? <StSection title="Client details"><StSurface label="Client setup form"><div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Subdomain *" value={form.subdomain} onChange={v => setForm({ ...form, subdomain: v })} placeholder="[business subdomain]" />
        <Field label="Site name *" value={form.siteName} onChange={v => setForm({ ...form, siteName: v })} placeholder="[business name]" />
        <Field label="Owner name *" value={form.ownerName} onChange={v => setForm({ ...form, ownerName: v })} placeholder="[owner name]" />
        <StTextField label="Owner email *" type="email" required value={form.ownerEmail} onChange={e => setForm({ ...form, ownerEmail: e.target.value })} placeholder="[owner email]" />
        <StField label="Industry *"><select value={form.industry} required onChange={e => setForm({ ...form, industry: e.target.value })}><option value="" disabled>Select industry…</option>{INDUSTRIES.map(i => <option key={i} value={i}>{i.replaceAll("-", " ")}</option>)}</select></StField>
        <Field label="Production domain (optional)" value={form.productionDomain} onChange={v => setForm({ ...form, productionDomain: v })} placeholder="[domain]" />
      </div>
      <div className="flex flex-col gap-3"><StSegmented label="Business presence" value={form.presence} options={PRESENCE_OPTIONS} onChange={presence => setForm({ ...form, presence })} /><p className="text-sm text-gray-muted">{PRESENCE_OPTIONS.find(option => option.value === form.presence)?.description}</p></div>
      <StField label="Billing" hint={BILLING_TYPES.find(bt => bt.value === form.billingType)?.hint}><select value={form.billingType} onChange={e => setForm({ ...form, billingType: e.target.value as BillingType | "" })}>{BILLING_TYPES.map(bt => <option key={bt.value} value={bt.value}>{bt.label}</option>)}</select></StField>
      {form.billingType === "tier" && <StField label="Tier"><select value={form.subscriptionPlan} onChange={e => setForm({ ...form, subscriptionPlan: e.target.value as CommercialPlanKey })}>{TIERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></StField>}
      {form.billingType === "custom" && <StTextField label="Monthly amount ($)" type="number" min="0" step="1" value={form.customMonthlyDollars} onChange={e => setForm({ ...form, customMonthlyDollars: e.target.value })} />}
      {error && <StNotice tone="critical">{error}</StNotice>}
      {running && <StSteps label="Client setup" steps={[{ title: "Strelva Agency is creating the site record", state: "active", detail: "Wait for the result before trying again." }]} />}
      <div><StPill onClick={() => void run()} disabled={running} busy={running}>{running ? "Creating…" : "Create Strelva Agency site record"}</StPill></div>
    </div></StSurface></StSection> : <>
      {restoredFromStorage && <StNotice action={<StTextButton onClick={clearStoredResult}>Dismiss</StTextButton>}>Showing the last client created: <StMono>{result.tenantId}</StMono>. Restored from this browser.</StNotice>}
      <StSection title={result.tenantId} action={<StPillLink href={`/admin/clients/${result.tenantId}`}>Open site</StPillLink>}>
        <StState kind={result.steps.some(step => step.status === "failed") ? "need" : "live"}>{result.steps.some(step => step.status === "failed") ? "Created with steps to review" : "Site record created"}</StState>
        <StTextButton href={result.siteUrl} target="_blank" rel="noopener noreferrer">{result.siteUrl} ↗</StTextButton>
        <details><summary className="cursor-pointer text-sm text-gray-muted">What Strelva Agency completed ({result.steps.filter(s => s.status === "ok").length}/{result.steps.length} steps)</summary><div className="mt-4"><StSteps label="Client setup result" steps={result.steps.map(s => ({ title: s.label, state: s.status === "ok" ? "done" : s.status === "failed" ? "failed" : "pending", detail: s.detail || (s.status === "skipped" ? "Skipped" : undefined) }))} /></div></details>
      </StSection>
      <StSection title="Your turn" meta="Complete these before handing over access.">
        {phaseGroups.length ? phaseGroups.map(group => <StSection key={group.label} title={group.label}><StRows>{group.items.map(item => <StRow key={item.key} title={item.title} detail={item.detail} lead={item.phase === "CRITICAL" ? <StState kind="down">Critical</StState> : undefined} />)}</StRows></StSection>) : <StEmpty>No structured next steps were returned.</StEmpty>}
        {(result.manualNext ?? []).filter(raw => !parseItem(raw)).map((raw, index) => <StNotice key={index}>{raw}</StNotice>)}
      </StSection>
      {Object.keys(result.clientEnv).length > 0 && <StSurface label="Repository configuration"><details><summary className="cursor-pointer text-sm text-gray-muted">Repository environment values · <StMono>{Object.keys(result.clientEnv).length}</StMono></summary><div className="mt-4 flex flex-col gap-4"><StNotice>REVALIDATION_SECRET is required and already set on the Vercel project.</StNotice><StTextButton onClick={copyEnv}>{copiedEnv ? "Copied" : "Copy all"}</StTextButton><pre className="whitespace-pre-wrap break-all"><StMono>{envText(result.clientEnv)}</StMono></pre></div></details></StSurface>}
      <div><StPill variant="soft" onClick={() => { clearStoredResult(); setForm(blank); }}>Set up another client</StPill></div>
    </>}
  </StPage>;
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <StTextField label={label} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />;
}
