"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Globe,
  Search,
  Shield,
  Smartphone,
  Code2,
  Lock,
  Accessibility,
  Loader2,
  Download,
} from "lucide-react";
import type { AuditResult, CheckStatus, CategoryResult } from "@/lib/audit/types";
import { topFixes } from "@/lib/audit/impact";

type ScanState = "idle" | "scanning" | "done" | "error";

const categoryIcons: Record<string, React.ReactNode> = {
  "web-vitals": <Globe className="size-5" />,
  seo: <Search className="size-5" />,
  mobile: <Smartphone className="size-5" />,
  schema: <Code2 className="size-5" />,
  ssl: <Lock className="size-5" />,
  a11y: <Accessibility className="size-5" />,
};

const statusIcon: Record<CheckStatus, React.ReactNode> = {
  pass: <CheckCircle2 className="size-4 shrink-0 text-m-success" />,
  warn: <AlertTriangle className="size-4 shrink-0 text-[#e9a23b]" />,
  fail: <XCircle className="size-4 shrink-0 text-m-danger" />,
};

function gradeColor(grade: string): string {
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

function scoreBarColor(score: number): string {
  if (score >= 80) return "var(--m-success)";
  if (score >= 60) return "var(--m-accent)";
  if (score >= 40) return "#e9a23b";
  return "var(--m-danger)";
}

function CategoryCard({ category }: { category: CategoryResult }) {
  const [expanded, setExpanded] = useState(false);
  const icon = categoryIcons[category.slug] ?? <Shield className="size-5" />;

  return (
    <div className="rounded-2xl border border-m-rule-soft bg-m-panel overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-4 p-5 text-left transition-colors hover:bg-m-panel-strong"
      >
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-m-accent-faint text-m-accent">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[15px] font-medium text-m-text">
              {category.name}
            </h3>
            <span
              className="text-[15px] font-semibold tabular-nums"
              style={{ color: scoreBarColor(category.score) }}
            >
              {category.score}
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-m-rule-soft">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${category.score}%`,
                backgroundColor: scoreBarColor(category.score),
              }}
            />
          </div>
        </div>
        <svg
          className={`size-4 shrink-0 text-m-text-3 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-m-rule-soft px-5 py-4">
          <ul className="grid gap-3">
            {category.checks.map((check) => (
              <li key={check.name} className="flex gap-3">
                {statusIcon[check.status]}
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-m-text">
                    {check.name}
                  </p>
                  <p className="text-[12px] text-m-text-3">
                    {check.message}
                  </p>
                  {check.impact && check.status !== "pass" && (
                    <p className="mt-1 text-[12px] leading-snug text-m-accent">
                      {check.impact}
                    </p>
                  )}
                  {check.details && (
                    <p className="mt-1 truncate text-[11px] font-mono text-m-text-3 opacity-70">
                      {check.details}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function AuditPage() {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<ScanState>("idle");
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState("");
  const [progressStep, setProgressStep] = useState(0);
  const [reportLoading, setReportLoading] = useState(false);

  const progressSteps = [
    "Connecting to site...",
    "Checking AI readability...",
    "Analyzing SEO foundations...",
    "Scanning security...",
    "Checking Core Web Vitals...",
    "Reviewing accessibility...",
    "Reading trust and content signals...",
    "Calculating score...",
  ];

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = url.trim();
    if (!cleaned) return;

    // Client-side URL validation
    let normalizedUrl = cleaned;
    if (!normalizedUrl.match(/^https?:\/\//i)) {
      normalizedUrl = `https://${normalizedUrl}`;
    }
    try {
      new URL(normalizedUrl);
    } catch {
      setError("Please enter a valid URL (e.g., example.com)");
      return;
    }

    setState("scanning");
    setError("");
    setResult(null);
    setProgressStep(0);

    // Animate progress steps
    const interval = setInterval(() => {
      setProgressStep((prev) => {
        if (prev >= progressSteps.length - 1) {
          clearInterval(interval);
          return prev;
        }
        return prev + 1;
      });
    }, 2800);

    try {
      const res = await fetch("/api/audit/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: cleaned }),
      });

      clearInterval(interval);

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Scan failed (${res.status})`);
      }

      const data: AuditResult = await res.json();
      setResult(data);
      setState("done");
    } catch (err) {
      clearInterval(interval);
      setError(err instanceof Error ? err.message : "Scan failed. Try again.");
      setState("error");
    }
  }

  function handleReset() {
    setState("idle");
    setResult(null);
    setError("");
    setUrl("");
  }

  // POST the current result to the report renderer and open the returned HTML
  // in a new tab so the user can print/save it as a PDF. Uses a blob URL so the
  // document is fully self-contained and never blocked by popup heuristics tied
  // to async document.write.
  async function handleDownloadReport() {
    if (!result || reportLoading) return;
    setReportLoading(true);
    try {
      const res = await fetch("/api/audit/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result),
      });
      if (!res.ok) throw new Error(`Report failed (${res.status})`);
      const html = await res.text();
      const blob = new Blob([html], { type: "text/html" });
      const blobUrl = URL.createObjectURL(blob);
      const opened = window.open(blobUrl, "_blank", "noopener,noreferrer");
      if (!opened) {
        // Popup blocked — fall back to a same-tab navigation.
        window.location.href = blobUrl;
      }
      // Revoke after the new tab has had time to load the document.
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch {
      setError("Could not generate the report. Please try again.");
    } finally {
      setReportLoading(false);
    }
  }

  return (
    <div className="marketing-root min-h-dvh px-5 py-5 md:px-8">
      <div className="relative z-10 mx-auto max-w-[960px] pt-20 pb-16">
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
              Free site health audit
            </p>
            <h1 className="mt-4 text-4xl font-semibold leading-[0.94] tracking-normal text-m-text sm:text-5xl md:text-6xl">
              How healthy is your website?
            </h1>
            <p className="mt-5 max-w-[620px] text-[17px] leading-[1.7] text-m-text-2">
              Enter your website URL and get an instant health score. We check
              speed, SEO, mobile experience, structured data, security, and
              accessibility.
            </p>

            <form
              onSubmit={handleScan}
              className="mt-8 flex flex-col gap-3 sm:flex-row"
            >
              <div className="relative flex-1">
                <Globe className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-m-text-3" />
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="example.com"
                  autoComplete="url"
                  inputMode="url"
                  className="h-14 w-full rounded-2xl border border-m-rule bg-m-surface pl-12 pr-4 text-[16px] text-m-text outline-none transition-colors placeholder:text-m-text-3 hover:border-m-rule focus:border-m-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-m-accent"
                />
              </div>
              <button
                type="submit"
                className="marketing-button-primary h-14 shrink-0 px-8 text-[15px]"
              >
                Scan My Site
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
              Free. No signup required. 3 scans per day.
            </p>
          </div>
        )}

        {/* Scanning state */}
        {state === "scanning" && (
          <div className="motion-rise">
            <p className="text-[14px] font-medium text-m-text-3">
              Scanning
            </p>
            <h2 className="mt-4 text-3xl font-semibold text-m-text sm:text-4xl">
              Analyzing your site...
            </h2>
            <p className="mt-3 text-[15px] text-m-text-2">
              {url}
            </p>

            <div className="mt-10 grid gap-4 rounded-2xl border border-m-rule-soft bg-m-panel p-6">
              {progressSteps.map((step, i) => (
                <div
                  key={step}
                  className="flex items-center gap-3 transition-opacity duration-300"
                  style={{ opacity: i <= progressStep ? 1 : 0.25 }}
                >
                  {i < progressStep ? (
                    <CheckCircle2 className="size-5 shrink-0 text-m-success" />
                  ) : i === progressStep ? (
                    <Loader2 className="size-5 shrink-0 animate-spin text-m-accent" />
                  ) : (
                    <div className="size-5 shrink-0 rounded-full border border-m-rule-soft" />
                  )}
                  <span className="text-[14px] text-m-text-2">
                    {step}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        {state === "done" && result && (
          <div className="motion-rise">
            {/* Score header */}
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
                    {result.overallScore}
                  </div>
                  <div
                    className="text-[13px] font-semibold"
                    style={{ color: gradeColor(result.grade) }}
                  >
                    {result.grade} Grade
                  </div>
                </div>
              </div>

              <h2 className="mt-6 text-3xl font-semibold text-m-text sm:text-4xl">
                Site Health Report
              </h2>
              <p className="mt-2 text-[15px] text-m-text-2">
                {result.url}
              </p>
              <p className="mt-1 text-[12px] text-m-text-3">
                Scanned {new Date(result.scannedAt).toLocaleString()}
              </p>
            </div>

            {/* Top priorities — the highest-impact fixes first */}
            {(() => {
              const fixes = topFixes(result.categories, 4);
              if (fixes.length === 0) return null;
              return (
                <div className="mt-10">
                  <h3 className="text-[15px] font-semibold text-m-text">
                    Fix these first
                  </h3>
                  <ul className="mt-3 grid gap-2">
                    {fixes.map((fix) => (
                      <li
                        key={`${fix.category}-${fix.name}`}
                        className="rounded-xl border border-m-rule-soft bg-m-panel px-4 py-3"
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="text-[13px] font-medium text-m-text">
                            {fix.name}
                          </p>
                          {fix.quantified ? (
                            <span className="shrink-0 text-[12px] font-semibold tabular-nums text-m-text">
                              {fix.quantified}
                            </span>
                          ) : (
                            <span className="shrink-0 text-[11px] uppercase tracking-wide text-m-text-3">
                              {fix.category}
                            </span>
                          )}
                        </div>
                        {fix.impact && (
                          <p className="mt-1 text-[12px] leading-snug text-m-accent">
                            {fix.impact}
                          </p>
                        )}
                        {fix.guides && fix.guides.length > 0 && (
                          <div className="mt-2 flex flex-col gap-1">
                            {fix.guides.map((g) => (
                              <Link
                                key={g.slug}
                                href={`/guides/${g.slug}`}
                                className="text-[12px] font-medium text-m-accent transition-colors hover:text-m-text"
                              >
                                Fix it: {g.title} -&gt;
                              </Link>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}

            {/* Category breakdown */}
            <div className="mt-10 grid gap-3">
              {result.categories.map((cat) => (
                <CategoryCard key={cat.slug} category={cat} />
              ))}
            </div>

            {/* CTA */}
            <div className="mt-10 rounded-2xl border border-m-accent bg-m-accent-faint p-6 text-center sm:p-8">
              <h3 className="text-xl font-semibold text-m-text sm:text-2xl">
                Your site scored {result.overallScore}/100.
              </h3>
              <p className="mx-auto mt-3 max-w-[480px] text-[15px] leading-[1.6] text-m-text-2">
                Strelva builds and manages local business websites that
                score higher — with AI-powered updates, health monitoring, and
                weekly reports.
              </p>
              <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  href="/access-request?ref=audit"
                  className="marketing-button-primary h-12 px-6"
                >
                  Request your build
                  <ArrowRight className="size-4" />
                </Link>
                <button
                  type="button"
                  onClick={handleDownloadReport}
                  disabled={reportLoading}
                  className="marketing-button-secondary h-12 px-6 disabled:opacity-60"
                >
                  {reportLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                  {reportLoading ? "Preparing..." : "Save as PDF"}
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="marketing-button-secondary h-12 px-6"
                >
                  Scan another site
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
