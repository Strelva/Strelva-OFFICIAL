"use client";

import { SignInButton, SignUpButton, useUser } from "@clerk/nextjs";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Check,
  CreditCard,
  ExternalLink,
  Loader2,
  LockKeyhole,
  MessageCircle,
  ShieldCheck,
  Wand2,
} from "lucide-react";
import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";

type FormState = {
  businessName: string;
  requestedSlug: string;
  industry: string;
  description: string;
  location: string;
  currentWebsite: string;
  bookingUrl: string;
  ownerPhone: string;
  startCheckout: boolean;
};

type ProvisionedSite = {
  tenantId: string;
  siteName: string;
  dashboardUrl: string;
  publicUrl: string;
  checkoutUrl: string | null;
};

const STORAGE_KEY = "scaffold-onboard-draft-v1";

const INDUSTRIES = [
  { value: "wellness", label: "Wellness" },
  { value: "restaurant", label: "Restaurant" },
  { value: "food-brand", label: "Food brand" },
  { value: "trades", label: "Trades" },
  { value: "professional", label: "Professional services" },
  { value: "retail", label: "Retail" },
];

const EMPTY_FORM: FormState = {
  businessName: "",
  requestedSlug: "",
  industry: "professional",
  description: "",
  location: "",
  currentWebsite: "",
  bookingUrl: "",
  ownerPhone: "",
  startCheckout: true,
};

const quickWins = [
  "Review the starter content the AI prepared.",
  "Update hours or booking details before publishing.",
  "Connect Google Business when you are ready.",
  "Ask AI for the first customer update or blog post.",
];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

function isUrlLike(value: string): boolean {
  if (!value.trim()) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export default function OnboardPage() {
  return (
    <Suspense fallback={<OnboardShell loading />}>
      <OnboardExperience />
    </Suspense>
  );
}

function OnboardExperience() {
  const searchParams = useSearchParams();
  const referredBy = searchParams.get("ref") || "";
  const { isLoaded, isSignedIn, user } = useUser();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [slugTouched, setSlugTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [site, setSite] = useState<ProvisionedSite | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as Partial<FormState>;
      setForm((current) => ({ ...current, ...parsed }));
      if (parsed.requestedSlug) setSlugTouched(true);
    } catch {
      // Local draft recovery is best-effort.
    }
  }, []);

  useEffect(() => {
    if (slugTouched) return;
    setForm((current) => ({
      ...current,
      requestedSlug: slugify(current.businessName),
    }));
  }, [form.businessName, slugTouched]);

  const completion = useMemo(() => {
    const required = [form.businessName, form.requestedSlug, form.description, form.location];
    return Math.round((required.filter((value) => value.trim()).length / required.length) * 100);
  }, [form]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    if (key === "requestedSlug") setSlugTouched(true);
  }

  function persistDraft() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
    } catch {
      // If storage is unavailable, the form can still submit after sign-in.
    }
  }

  function validateForm(): string | null {
    if (form.businessName.trim().length < 2) return "Add the business name.";
    if (form.requestedSlug.trim().length < 3) return "Choose a subdomain with at least 3 characters.";
    if (form.description.trim().length < 20) return "Add a short description so the starter site has useful context.";
    if (!form.location.trim()) return "Add the business location or service area.";
    if (!isUrlLike(form.currentWebsite)) return "Current website must start with http:// or https://.";
    if (!isUrlLike(form.bookingUrl)) return "Booking URL must start with http:// or https://.";
    return null;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    persistDraft();
    if (!isLoaded) return;
    if (!isSignedIn) {
      window.location.href = `/sign-up?redirect_url=${encodeURIComponent("/onboard")}`;
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/self-serve/tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          ...form,
          requestedSlug: slugify(form.requestedSlug),
          referredBy: referredBy || undefined,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body?.error || "Could not create the site. Try again.");
        return;
      }

      localStorage.removeItem(STORAGE_KEY);
      setSite(body as ProvisionedSite);
      if (body.checkoutUrl && form.startCheckout) {
        window.location.href = body.checkoutUrl;
      }
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (site) {
    return <SuccessState site={site} />;
  }

  return (
    <OnboardShell>
      <div className="mx-auto grid w-full max-w-6xl gap-5 px-5 py-6 lg:grid-cols-[0.86fr_1.14fr] lg:px-8 lg:py-8">
        <aside className="flex flex-col justify-between border border-white/10 bg-[#111111] p-5 lg:min-h-[calc(100vh-4rem)] lg:p-6">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[12px] text-[#b8b8b8]">
              <ShieldCheck size={14} />
              Owner setup
            </div>
            <h1 className="max-w-xl text-[clamp(2rem,5vw,4.25rem)] font-medium leading-none tracking-normal text-[#f6f3ee]">
              Tell us about the business. We prepare the site.
            </h1>
            <p className="mt-5 max-w-lg text-[15px] leading-7 text-[#a7a29a]">
              Add the basics once. Scaffold Web creates the tenant, starter content, dashboard access, and first proof path so you can get live quickly.
            </p>
          </div>

          <div className="mt-8 grid gap-3">
            <StatusRow icon={<LockKeyhole size={15} />} label="Account" value={isSignedIn ? user?.primaryEmailAddress?.emailAddress || "Connected" : "Create or sign in"} done={!!isSignedIn} />
            <StatusRow icon={<Building2 size={15} />} label="Starter site" value={`${completion}% ready`} done={completion === 100} />
            <StatusRow icon={<CreditCard size={15} />} label="Plan" value={form.startCheckout ? "$149/mo checkout" : "Connect later"} done={false} />
          </div>
        </aside>

        <main className="border border-white/10 bg-[#0b0b0c]">
          <div className="border-b border-white/10 px-5 py-4 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[12px] text-[#827c73]">Setup</p>
                <h2 className="mt-1 text-[22px] font-medium text-[#f6f3ee]">Business profile</h2>
              </div>
              <AccountGate isLoaded={isLoaded} isSignedIn={!!isSignedIn} />
            </div>
          </div>

          <form onSubmit={submit} className="grid gap-0">
            <Section title="Identity" description="Used for the tenant record, subdomain, dashboard, and starter site.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Business name" required>
                  <input
                    value={form.businessName}
                    onChange={(event) => updateField("businessName", event.target.value)}
                    placeholder="Sunrise Yoga Studio"
                    className="onboard-input"
                  />
                </Field>
                <Field label="Scaffold subdomain" required hint={`${slugify(form.requestedSlug || "your-business")}.scaffoldweb.com`}>
                  <input
                    value={form.requestedSlug}
                    onChange={(event) => updateField("requestedSlug", slugify(event.target.value))}
                    placeholder="sunrise-yoga"
                    className="onboard-input font-mono"
                  />
                </Field>
              </div>
              <Field label="Business type">
                <select
                  value={form.industry}
                  onChange={(event) => updateField("industry", event.target.value)}
                  className="onboard-input"
                >
                  {INDUSTRIES.map((industry) => (
                    <option key={industry.value} value={industry.value}>
                      {industry.label}
                    </option>
                  ))}
                </select>
              </Field>
            </Section>

            <Section title="Context" description="Enough detail for the AI to pre-fill useful first content.">
              <Field label="What should visitors understand first?" required>
                <textarea
                  value={form.description}
                  onChange={(event) => updateField("description", event.target.value)}
                  rows={4}
                  placeholder="We offer private and small-group yoga classes for busy adults who want strength, mobility, and a calmer week."
                  className="onboard-input min-h-32 resize-none leading-6"
                />
              </Field>
              <Field label="Location or service area" required>
                <input
                  value={form.location}
                  onChange={(event) => updateField("location", event.target.value)}
                  placeholder="Buffalo, NY"
                  className="onboard-input"
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Current website">
                  <input
                    value={form.currentWebsite}
                    onChange={(event) => updateField("currentWebsite", event.target.value)}
                    placeholder="https://example.com"
                    className="onboard-input"
                  />
                </Field>
                <Field label="Booking URL">
                  <input
                    value={form.bookingUrl}
                    onChange={(event) => updateField("bookingUrl", event.target.value)}
                    placeholder="https://calendly.com/..."
                    className="onboard-input"
                  />
                </Field>
              </div>
              <Field label="Owner phone">
                <input
                  value={form.ownerPhone}
                  onChange={(event) => updateField("ownerPhone", event.target.value)}
                  placeholder="Optional"
                  className="onboard-input"
                />
              </Field>
            </Section>

            <Section title="First run" description="The dashboard opens with useful next steps instead of a blank setup screen.">
              <div className="grid gap-2">
                {quickWins.map((item) => (
                  <div key={item} className="flex items-center gap-3 border border-white/10 bg-white/[0.025] px-4 py-3 text-[13px] text-[#cfc8bc]">
                    <Wand2 size={15} className="text-[#d7b46a]" />
                    {item}
                  </div>
                ))}
              </div>

              <label className="flex cursor-pointer items-start gap-3 border border-white/10 bg-white/[0.025] p-4">
                <input
                  type="checkbox"
                  checked={form.startCheckout}
                  onChange={(event) => updateField("startCheckout", event.target.checked)}
                  className="mt-1 h-4 w-4 accent-[#f6f3ee]"
                />
                <span>
                  <span className="block text-[14px] font-medium text-[#f6f3ee]">
                    Start the $149/mo platform checkout after setup
                  </span>
                  <span className="mt-1 block text-[13px] leading-6 text-[#8d877f]">
                    Website operations, reports, updates, dashboard access, and owner controls.
                  </span>
                </span>
              </label>

              {error ? (
                <div className="border border-red-400/30 bg-red-500/10 px-4 py-3 text-[13px] text-red-200" role="alert">
                  {error}
                </div>
              ) : null}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[12px] leading-5 text-[#827c73]">
                  Starter content stays controlled. You can review, edit, and publish from the dashboard.
                </p>
                <button
                  type="submit"
                  disabled={submitting || !isLoaded}
                  className="inline-flex min-h-11 items-center justify-center gap-2 bg-[#f6f3ee] px-5 text-[14px] font-medium text-[#080808] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Creating site
                    </>
                  ) : isSignedIn ? (
                    <>
                      Create starter site
                      <ArrowRight size={16} />
                    </>
                  ) : (
                    <>
                      Save and create account
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </div>
            </Section>
          </form>
        </main>
      </div>
      <OnboardStyles />
    </OnboardShell>
  );
}

function OnboardShell({ children, loading = false }: { children?: React.ReactNode; loading?: boolean }) {
  return (
    <div className="min-h-screen bg-[#080808] text-[#f6f3ee]">
      {loading ? (
        <div className="flex min-h-screen items-center justify-center text-[13px] text-[#8d877f]">
          Preparing setup
        </div>
      ) : children}
    </div>
  );
}

function AccountGate({ isLoaded, isSignedIn }: { isLoaded: boolean; isSignedIn: boolean }) {
  if (!isLoaded) {
    return <span className="text-[12px] text-[#8d877f]">Checking account</span>;
  }

  if (isSignedIn) {
    return (
      <span className="inline-flex items-center gap-2 border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-[12px] text-emerald-200">
        <Check size={14} />
        Account connected
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <SignInButton mode="modal">
        <button type="button" className="border border-white/10 px-3 py-1.5 text-[12px] text-[#b8b8b8] hover:bg-white/[0.04]">
          Sign in
        </button>
      </SignInButton>
      <SignUpButton mode="modal">
        <button type="button" className="bg-white px-3 py-1.5 text-[12px] font-medium text-[#080808]">
          Create account
        </button>
      </SignUpButton>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-5 border-b border-white/10 px-5 py-6 last:border-b-0 sm:px-6 lg:grid-cols-[0.42fr_1fr]">
      <div>
        <h3 className="text-[15px] font-medium text-[#f6f3ee]">{title}</h3>
        <p className="mt-2 max-w-xs text-[12px] leading-5 text-[#827c73]">{description}</p>
      </div>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2">
      <span className="flex items-center justify-between gap-3 text-[12px] text-[#b8b8b8]">
        <span>{label}{required ? " *" : ""}</span>
        {hint ? <span className="truncate font-mono text-[#77716a]">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

function StatusRow({
  icon,
  label,
  value,
  done,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  done: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border border-white/10 bg-white/[0.025] px-4 py-3">
      <div className="flex items-center gap-3 text-[13px] text-[#cfc8bc]">
        <span className="text-[#8d877f]">{icon}</span>
        {label}
      </div>
      <div className="flex min-w-0 items-center gap-2 text-right text-[12px] text-[#8d877f]">
        {done ? <BadgeCheck size={14} className="shrink-0 text-emerald-300" /> : null}
        <span className="truncate">{value}</span>
      </div>
    </div>
  );
}

function SuccessState({ site }: { site: ProvisionedSite }) {
  return (
    <OnboardShell>
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-5 py-12">
        <div className="border border-white/10 bg-[#111111] p-6 sm:p-8">
          <div className="mb-6 inline-flex h-10 w-10 items-center justify-center border border-emerald-400/20 bg-emerald-400/10 text-emerald-200">
            <Check size={19} />
          </div>
          <h1 className="text-[clamp(2rem,5vw,3.5rem)] font-medium leading-none tracking-normal text-[#f6f3ee]">
            {site.siteName} is ready.
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-7 text-[#a7a29a]">
            The tenant, starter content, dashboard access, and owner controls are connected. Continue into the dashboard to review, publish, and tell the AI what to change next.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <a
              href={site.dashboardUrl}
              className="inline-flex min-h-11 items-center justify-center gap-2 bg-[#f6f3ee] px-5 text-[14px] font-medium text-[#080808]"
            >
              Open dashboard
              <ArrowRight size={16} />
            </a>
            <a
              href={site.publicUrl}
              className="inline-flex min-h-11 items-center justify-center gap-2 border border-white/10 px-5 text-[14px] text-[#cfc8bc] hover:bg-white/[0.04]"
            >
              View starter site
              <ExternalLink size={15} />
            </a>
          </div>
        </div>
      </div>
    </OnboardShell>
  );
}

function OnboardStyles() {
  return (
    <style jsx global>{`
      .onboard-input {
        width: 100%;
        min-height: 44px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(255, 255, 255, 0.035);
        padding: 0.72rem 0.85rem;
        color: #f6f3ee;
        font-size: 14px;
        outline: none;
        transition: border-color 160ms ease, background 160ms ease;
      }
      .onboard-input::placeholder {
        color: #6f6960;
      }
      .onboard-input:focus {
        border-color: rgba(246, 243, 238, 0.42);
        background: rgba(255, 255, 255, 0.055);
      }
      .onboard-input option {
        background: #111111;
        color: #f6f3ee;
      }
    `}</style>
  );
}
