"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import type { AiVisibilityResult, Grade } from "@/lib/ai-visibility/score";

type ScanState = "idle" | "scanning" | "done" | "error";

function gradeColor(grade: Grade): string {
  switch (grade) {
    case "A":
      return "var(--m-success)";
    case "B":
      return "var(--m-accent)";
    case "C":
      return "#e9a23b";
    case "D":
      return "#e97a3b";
    default:
      return "var(--m-danger)";
  }
}

export function AiVisibilityPage() {
  const [business, setBusiness] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState<ScanState>("idle");
  const [result, setResult] = useState<AiVisibilityResult | null>(null);
  const [error, setError] = useState("");

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    const name = business.trim();
    if (!name) {
      setError("Enter your business name to run the audit.");
      return;
    }

    const cleanedUrl = url.trim();
    if (cleanedUrl) {
      const normalized = /^https?:\/\//i.test(cleanedUrl)
        ? cleanedUrl
        : `https://${cleanedUrl}`;
      try {
        new URL(normalized);
      } catch {
        setError("Please enter a valid website URL (e.g., example.com).");
        return;
      }
    }

    setState("scanning");
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/ai-visibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business: name,
          url: cleanedUrl || undefined,
          category: category.trim() || undefined,
          city: city.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Audit failed (${res.status})`);
      }

      const data: AiVisibilityResult = await res.json();
      setResult(data);
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Audit failed. Try again.");
      setState("error");
    }
  }

  function handleReset() {
    setState("idle");
    setResult(null);
    setError("");
  }

  return (
    <div className="marketing-root min-h-dvh px-5 py-5 md:px-8">
      <div className="relative z-10 mx-auto max-w-[760px] pt-20 pb-16">
        {/* Header */}
        <div className="motion-rise mb-10">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-[13px] font-medium text-m-text-2 transition-colors hover:text-m-text"
          >
            <ArrowLeft className="size-4" />
            Strelva
          </Link>
        </div>

        {/* Input form */}
        {(state === "idle" || state === "error") && (
          <div className="motion-rise">
            <p className="text-[14px] font-medium text-m-text-3">
              Free AI visibility audit
            </p>
            <h1 className="mt-4 text-4xl font-semibold leading-[0.94] tracking-normal text-m-text sm:text-5xl md:text-6xl">
              Does AI recommend your business?
            </h1>
            <p className="mt-5 max-w-[620px] text-[17px] leading-[1.7] text-m-text-2">
              When customers ask ChatGPT or Gemini for the best option near them,
              do you show up? Get an instant A&ndash;F grade for how visible your
              business is to AI search.
            </p>

            <form onSubmit={handleScan} className="mt-8 grid gap-3 sm:grid-cols-2">
              <input
                type="text"
                value={business}
                onChange={(e) => setBusiness(e.target.value)}
                placeholder="Business name"
                autoComplete="organization"
                className="h-14 w-full rounded-2xl border border-m-rule bg-m-surface px-4 text-[16px] text-m-text outline-none transition-colors placeholder:text-m-text-3 focus:border-m-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-m-accent"
              />
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="example.com"
                autoComplete="url"
                inputMode="url"
                className="h-14 w-full rounded-2xl border border-m-rule bg-m-surface px-4 text-[16px] text-m-text outline-none transition-colors placeholder:text-m-text-3 focus:border-m-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-m-accent"
              />
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Category (e.g. HVAC, dentist)"
                className="h-14 w-full rounded-2xl border border-m-rule bg-m-surface px-4 text-[16px] text-m-text outline-none transition-colors placeholder:text-m-text-3 focus:border-m-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-m-accent"
              />
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="City (e.g. Buffalo, NY)"
                autoComplete="address-level2"
                className="h-14 w-full rounded-2xl border border-m-rule bg-m-surface px-4 text-[16px] text-m-text outline-none transition-colors placeholder:text-m-text-3 focus:border-m-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-m-accent"
              />
              <button
                type="submit"
                className="marketing-button-primary h-14 px-8 text-[15px] sm:col-span-2"
              >
                Run my AI audit
                <ArrowRight className="size-4" />
              </button>
            </form>

            {error && (
              <p
                role="alert"
                className="mt-4 rounded-lg border px-4 py-3 text-[13px]"
                style={{
                  color: "var(--m-danger)",
                  borderColor:
                    "color-mix(in oklch, var(--m-danger) 38%, transparent)",
                  background:
                    "color-mix(in oklch, var(--m-danger) 10%, transparent)",
                }}
              >
                {error}
              </p>
            )}

            <p className="mt-4 text-[13px] text-m-text-3">
              Free. No signup required. Add your website for AI-readiness signals.
            </p>
          </div>
        )}

        {/* Scanning state */}
        {state === "scanning" && (
          <div className="motion-rise">
            <p className="text-[14px] font-medium text-m-text-3">
              Auditing
            </p>
            <h2 className="mt-4 text-3xl font-semibold text-m-text sm:text-4xl">
              Checking AI visibility for {business}...
            </h2>
            <div className="mt-10 flex items-center gap-3 rounded-2xl border border-m-rule-soft bg-m-panel p-6">
              <Loader2 className="size-5 shrink-0 animate-spin text-m-accent" />
              <span className="text-[14px] text-m-text-2">
                Reading your site, checking AI-crawler access, and probing live AI
                answers...
              </span>
            </div>
          </div>
        )}

        {/* Results */}
        {state === "done" && result && (
          <div className="motion-rise">
            {/* Grade header */}
            <div className="flex flex-col items-center text-center">
              <div
                className="flex size-28 items-center justify-center rounded-full border-4 sm:size-32"
                style={{
                  borderColor: gradeColor(result.grade),
                  background: `color-mix(in oklch, ${gradeColor(result.grade)} 10%, transparent)`,
                }}
              >
                <div>
                  <div
                    className="text-4xl font-bold tabular-nums sm:text-5xl"
                    style={{ color: gradeColor(result.grade) }}
                  >
                    {result.grade}
                  </div>
                  <div
                    className="text-[13px] font-semibold tabular-nums"
                    style={{ color: gradeColor(result.grade) }}
                  >
                    {result.score}/100
                  </div>
                </div>
              </div>

              <h2 className="mt-6 text-2xl font-semibold text-m-text sm:text-3xl">
                {result.business}
              </h2>
              {result.url && (
                <p className="mt-2 text-[14px] text-m-text-3">
                  {result.url}
                </p>
              )}
              <p className="mx-auto mt-4 max-w-[560px] text-[16px] font-medium leading-[1.6] text-m-text">
                {result.verdict}
              </p>
            </div>

            {/* Signals */}
            {result.signals.length > 0 && (
              <div className="mt-10">
                <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-m-text-3">
                  AI readiness signals
                </h3>
                <ul className="mt-4 grid gap-3">
                  {result.signals.map((s) => (
                    <li
                      key={s.id}
                      className="flex gap-3 rounded-2xl border border-m-rule-soft bg-m-panel p-4"
                    >
                      {s.pass ? (
                        <CheckCircle2 className="size-5 shrink-0 text-m-success" />
                      ) : (
                        <XCircle className="size-5 shrink-0 text-m-danger" />
                      )}
                      <div className="min-w-0">
                        <p className="text-[14px] font-medium text-m-text">
                          {s.label}
                          <span className="ml-2 text-[12px] font-normal text-m-text-3">
                            {s.weight} pts
                          </span>
                        </p>
                        <p className="text-[13px] text-m-text-2">
                          {s.detail}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Live citation probe */}
            <div className="mt-6 rounded-2xl border border-m-rule-soft bg-m-panel p-5">
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-m-text-3">
                Live AI citation probe
              </h3>
              <p className="mt-2 text-[14px] leading-[1.6] text-m-text-2">
                {result.citation.note}
              </p>
            </div>

            {/* Top fix */}
            <div
              className="mt-6 rounded-2xl border-l-4 bg-m-panel p-5"
              style={{ borderLeftColor: gradeColor(result.grade) }}
            >
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-m-text-3">
                Do this first
              </h3>
              <p className="mt-2 text-[15px] font-medium leading-[1.6] text-m-text">
                {result.topFix}
              </p>
            </div>

            {/* CTA */}
            <div className="mt-10 rounded-2xl border border-m-accent bg-m-accent-faint p-6 text-center sm:p-8">
              <h3 className="text-xl font-semibold text-m-text sm:text-2xl">
                Want to be the answer AI gives?
              </h3>
              <p className="mx-auto mt-3 max-w-[480px] text-[15px] leading-[1.6] text-m-text-2">
                Strelva builds and manages local business websites that AI can
                read, trust, and recommend &mdash; with structured data,
                AI-crawler access, and weekly monitoring.
              </p>
              <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  href="/access-request?ref=ai-visibility"
                  className="marketing-button-primary h-12 px-6"
                >
                  Get this fixed
                  <ArrowRight className="size-4" />
                </Link>
                <button
                  type="button"
                  onClick={handleReset}
                  className="marketing-button-secondary h-12 px-6"
                >
                  Audit another business
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
