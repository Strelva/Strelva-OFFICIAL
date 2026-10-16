"use client";

import { useEffect, useState } from "react";
import { XaButton, XaChoices, XaSays, XaTextLink, type XaOption } from "@/components/ui/strelva/Xa";
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
  { label: "Warm and friendly", value: "Warm, friendly, and welcoming, like a neighbor who knows their stuff." },
  { label: "Polished and professional", value: "Polished and professional, clear and confident without being stiff." },
  { label: "Bold and direct", value: "Bold and direct: short sentences, no fluff, get to the point." },
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

  const stepIndex = step === "find" ? 1 : step === "want" ? 2 : step === "voice" ? 3 : 0;

  // Inline on Today, never a modal: three answers in place, then one settled sentence.
  return (
    <section className="flex flex-col gap-5" aria-labelledby="onboarding-wizard-title">
      {step === "welcome" && (
        <>
          <XaSays links={[<XaTextLink key="skip" onClick={dismiss}>Not now</XaTextLink>]}>
            <span id="onboarding-wizard-title">Welcome, {firstName}. Three quick answers and Strelva runs your site the way you would.</span>
          </XaSays>
          <div><XaButton onClick={() => setStep("find")}>Answer three questions</XaButton></div>
        </>
      )}

      {step === "find" && (
        <Question
          index={stepIndex}
          title="How do customers usually find you?"
          hint="This decides whether Strelva looks after your Google listing and reviews."
          options={[
            { value: "local", label: "Locally", detail: "They visit, or you serve an area" },
            { value: "online", label: "Online only", detail: "No local presence" },
            { value: "hybrid", label: "Both", detail: "Online and local" },
          ]}
          selected={model}
          onSelect={(k) => setModel(k as BusinessModel)}
          onNext={() => setStep("want")}
          onSkip={dismiss}
        />
      )}

      {step === "want" && (
        <Question
          index={stepIndex}
          title="What do you want more of?"
          hint="Strelva tracks this every week and says how it went."
          options={[
            { value: "visitors", label: "More visitors", detail: "Get found by more people" },
            { value: "bookings", label: "More bookings", detail: "Turn visits into customers" },
            { value: "reviews", label: "More reviews", detail: "Build trust and rank higher" },
          ]}
          selected={want}
          onSelect={(k) => setWant(k as MetricKey)}
          onNext={() => setStep("voice")}
          onSkip={dismiss}
        />
      )}

      {step === "voice" && (
        <Question
          index={stepIndex}
          title="How should your site sound?"
          hint="Strelva writes in this voice every time it changes your site."
          options={VOICE_PRESETS.map((v) => ({ value: v.value, label: v.label, detail: v.value }))}
          selected={voice || null}
          onSelect={setVoice}
          onNext={finish}
          nextLabel="Save answers"
          busy={saving}
          onSkip={dismiss}
        />
      )}

      {step === "done" && (
        <XaSays links={[<XaTextLink key="close" onClick={() => setShow(false)}>Close</XaTextLink>]}>
          <span id="onboarding-wizard-title">Saved. Strelva uses your answers on every change. You can change them in Business details.</span>
        </XaSays>
      )}
    </section>
  );
}

function Question({
  index,
  title,
  hint,
  options,
  selected,
  onSelect,
  onNext,
  onSkip,
  nextLabel = "Next",
  busy = false,
}: {
  index: number;
  title: string;
  hint: string;
  options: readonly XaOption<string>[];
  selected: string | null;
  onSelect: (key: string) => void;
  onNext: () => void;
  onSkip: () => void;
  nextLabel?: string;
  busy?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="m-0 text-[13px] font-medium text-[var(--st-text-3)]">Question {index} of 3</p>
        <h2 id="onboarding-wizard-title" className="m-0 text-[20px] font-medium tracking-[-0.3px] text-[var(--st-text)]">{title}</h2>
        <p className="m-0 text-[14px] text-[var(--st-text-2)]">{hint}</p>
      </div>
      <XaChoices label={title} value={selected} options={options} onChange={onSelect} />
      <div className="flex items-center gap-4">
        <XaButton onClick={onNext} disabled={!selected} busy={busy}>{nextLabel}</XaButton>
        <XaTextLink onClick={onSkip}>Skip the rest</XaTextLink>
      </div>
    </div>
  );
}
