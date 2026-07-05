"use client";

import { useEffect, useState } from "react";
import { MapPin, Globe, Store, TrendingUp, MousePointerClick, Star, Sparkles, ArrowRight, Check } from "lucide-react";
import { useDashboardOptional } from "./DashboardContext";
import type { MetricKey } from "@/lib/proof";

/**
 * Conversational first-run setup. For a brand-new owner (no business type set
 * yet), this walks three quick questions — how customers find you, what you want
 * more of, how the AI should sound — and writes them straight into the settings
 * + a weekly goal the AI then uses on every update. Self-contained: fetches its
 * own settings, decides whether to show, and gets out of the way once done.
 */

const DISMISS_KEY = (t: string) => `strelva-onboarded-${t}`;

type BusinessModel = "local" | "online" | "hybrid";
type Step = "welcome" | "find" | "want" | "voice" | "done";

const VOICE_PRESETS: { label: string; value: string }[] = [
  { label: "Warm & friendly", value: "Warm, friendly, and welcoming — like a neighbor who knows their stuff." },
  { label: "Polished & professional", value: "Polished and professional, clear and confident without being stiff." },
  { label: "Bold & direct", value: "Bold and direct — short sentences, no fluff, get to the point." },
];

export function OnboardingWizard() {
  const dashboard = useDashboardOptional();
  const readOnly = dashboard?.readOnly ?? false;
  const tenant = dashboard?.tenantId ?? "";
  const accountName = dashboard?.impersonation.actorName ?? "";
  const apiPath = (p: string) => dashboard?.dashboardHref(p) ?? p;
  const firstName = accountName.trim().split(/\s+/)[0] || "there";

  const [show, setShow] = useState(false);
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [step, setStep] = useState<Step>("welcome");
  const [model, setModel] = useState<BusinessModel | null>(null);
  const [want, setWant] = useState<MetricKey | null>(null);
  const [voice, setVoice] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Decide whether to show: a genuinely brand-new owner only. Two gates so it
  // never re-fires for a returning, already-set-up client:
  //  1. localStorage dismiss (fast, per-device once completed/skipped here), and
  //  2. the server onboarding-status — if the tenant has ANY real progress
  //     (connected an account, made an AI edit, or received a weekly report),
  //     they're an established client, so the "welcome, let's set up" modal must
  //     not appear even on a fresh browser where businessModel was never set.
  // Read-only viewers (the public demo) never see it.
  useEffect(() => {
    if (readOnly) return;
    if (typeof window !== "undefined" && localStorage.getItem(DISMISS_KEY(tenant))) return;
    Promise.all([
      fetch(apiPath("/api/content/settings"), { credentials: "same-origin" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch(apiPath("/api/dashboard/onboarding-status"), { credentials: "same-origin" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]).then(([data, status]) => {
      if (!data) return;
      setSettings(data);
      const established = Array.isArray(status?.steps)
        ? status.steps.some(
            (s: { key?: string; done?: boolean }) => s.key !== "business_type" && s.done,
          )
        : false;
      if (!data.businessModel && !established) setShow(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function dismiss() {
    if (typeof window !== "undefined") localStorage.setItem(DISMISS_KEY(tenant), "1");
    setShow(false);
  }

  async function finish() {
    setSaving(true);
    try {
      // Merge into the FULL settings object — the content PUT validates the whole
      // shape, so a partial write would fail.
      const next = {
        ...(settings ?? {}),
        ...(model ? { businessModel: model } : {}),
        ...(voice ? { brandVoice: voice } : {}),
      };
      await fetch(apiPath("/api/content/settings"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(next),
      }).catch(() => {});

      if (want) {
        const defaults: Record<MetricKey, number> = { visitors: 30, bookings: 10, reviews: 3 };
        await fetch(apiPath("/api/dashboard/goal"), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ metric: want, target: defaults[want] }),
        }).catch(() => {});
      }
    } finally {
      setSaving(false);
      if (typeof window !== "undefined") localStorage.setItem(DISMISS_KEY(tenant), "1");
      setStep("done");
    }
  }

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-overlay-scrim p-4 backdrop-blur-sm" data-dashboard>
      <div className="w-full max-w-lg rounded-2xl border border-glass-border bg-surface-base p-6 shadow-[0_24px_80px_rgba(0,0,0,0.5)] sm:p-8">
        {/* Progress dots */}
        {step !== "welcome" && step !== "done" && (
          <div className="mb-5 flex items-center gap-1.5">
            {(["find", "want", "voice"] as const).map((s) => (
              <span
                key={s}
                className={`h-1.5 flex-1 rounded-full ${s === step ? "bg-accent" : "bg-gray-bg"}`}
              />
            ))}
          </div>
        )}

        {step === "welcome" && (
          <div className="text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-accent-dim text-accent">
              <Sparkles className="h-5 w-5" strokeWidth={1.6} />
            </span>
            <h2 className="mt-4 text-[22px] font-semibold text-warm-black">Welcome, {firstName}.</h2>
            <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-gray-muted">
              Three quick questions so Strelva manages your site the way you&apos;d want. About 30 seconds.
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => setStep("find")}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-[14px] font-medium text-on-accent transition-colors hover:bg-accent/85"
              >
                Let&apos;s go <ArrowRight className="h-4 w-4" strokeWidth={1.8} />
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="rounded-lg px-5 py-2.5 text-[14px] font-medium text-gray-muted transition-colors hover:text-warm-black"
              >
                Skip for now
              </button>
            </div>
          </div>
        )}

        {step === "find" && (
          <Question
            title="How do customers usually find you?"
            hint="This decides whether we set up Google Business & reviews for you."
            options={[
              { key: "local", label: "Locally", desc: "They visit, or I serve an area", icon: MapPin },
              { key: "online", label: "Online only", desc: "No physical or local presence", icon: Globe },
              { key: "hybrid", label: "Both", desc: "Online and local", icon: Store },
            ]}
            selected={model}
            onSelect={(k) => setModel(k as BusinessModel)}
            onNext={() => setStep("want")}
            onSkip={dismiss}
          />
        )}

        {step === "want" && (
          <Question
            title="What do you want more of?"
            hint="We'll set this as your weekly goal and track it on every report."
            options={[
              { key: "visitors", label: "More visitors", desc: "Get found by more people", icon: TrendingUp },
              { key: "bookings", label: "More bookings", desc: "Turn visits into customers", icon: MousePointerClick },
              { key: "reviews", label: "More reviews", desc: "Build trust and rank higher", icon: Star },
            ]}
            selected={want}
            onSelect={(k) => setWant(k as MetricKey)}
            onNext={() => setStep("voice")}
            onSkip={dismiss}
          />
        )}

        {step === "voice" && (
          <div>
            <h2 className="text-[20px] font-semibold text-warm-black">How should Strelva sound?</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-gray-muted">
              Pick a voice — we&apos;ll use it every time we write or update your site.
            </p>
            <div className="mt-4 grid gap-2">
              {VOICE_PRESETS.map((v) => (
                <button
                  key={v.label}
                  type="button"
                  onClick={() => setVoice(v.value)}
                  className={`rounded-xl border p-3.5 text-left transition-colors ${
                    voice === v.value ? "border-accent/50 bg-accent-dim/40" : "border-gray-border hover:border-accent/30"
                  }`}
                >
                  <p className="text-[14px] font-medium text-warm-black">{v.label}</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-gray-muted">{v.value}</p>
                </button>
              ))}
            </div>
            <div className="mt-5 flex items-center justify-between">
              <button type="button" onClick={dismiss} className="text-[13px] font-medium text-gray-muted hover:text-warm-black">
                Skip
              </button>
              <button
                type="button"
                onClick={finish}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-[14px] font-medium text-on-accent transition-colors hover:bg-accent/85 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Finish setup"}
                {!saving && <Check className="h-4 w-4" strokeWidth={2} />}
              </button>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-success-dim text-success">
              <Check className="h-5 w-5" strokeWidth={2} />
            </span>
            <h2 className="mt-4 text-[22px] font-semibold text-warm-black">You&apos;re all set.</h2>
            <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-gray-muted">
              I&apos;ll use this every time I manage your site. You can change any of it in Settings anytime.
            </p>
            <button
              type="button"
              onClick={() => setShow(false)}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-[14px] font-medium text-on-accent transition-colors hover:bg-accent/85"
            >
              Go to my dashboard <ArrowRight className="h-4 w-4" strokeWidth={1.8} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Question({
  title,
  hint,
  options,
  selected,
  onSelect,
  onNext,
  onSkip,
}: {
  title: string;
  hint: string;
  options: { key: string; label: string; desc: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }[];
  selected: string | null;
  onSelect: (key: string) => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  return (
    <div>
      <h2 className="text-[20px] font-semibold text-warm-black">{title}</h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-gray-muted">{hint}</p>
      <div className="mt-4 grid gap-2">
        {options.map((o) => {
          const Icon = o.icon;
          const active = selected === o.key;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => onSelect(o.key)}
              className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-colors ${
                active ? "border-accent/50 bg-accent-dim/40" : "border-gray-border hover:border-accent/30"
              }`}
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${active ? "bg-accent text-on-accent" : "bg-accent-dim text-accent"}`}>
                <Icon className="h-4 w-4" strokeWidth={1.6} />
              </span>
              <span>
                <span className="block text-[14px] font-medium text-warm-black">{o.label}</span>
                <span className="block text-[12px] text-gray-muted">{o.desc}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-5 flex items-center justify-between">
        <button type="button" onClick={onSkip} className="text-[13px] font-medium text-gray-muted hover:text-warm-black">
          Skip
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!selected}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-[14px] font-medium text-on-accent transition-colors hover:bg-accent/85 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next <ArrowRight className="h-4 w-4" strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}
