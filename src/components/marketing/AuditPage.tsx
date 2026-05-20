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
} from "lucide-react";
import type { AuditResult, CheckStatus, CategoryResult } from "@/lib/audit/types";

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
  pass: <CheckCircle2 className="size-4 shrink-0 text-[color:var(--m-success)]" />,
  warn: <AlertTriangle className="size-4 shrink-0 text-[#e9a23b]" />,
  fail: <XCircle className="size-4 shrink-0 text-[color:var(--m-danger)]" />,
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
    <div className="rounded-2xl border border-[var(--m-rule-soft)] bg-[var(--m-panel)] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-4 p-5 text-left transition-colors hover:bg-[var(--m-panel-strong)]"
      >
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--m-accent-faint)] text-[color:var(--m-accent)]">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[15px] font-medium text-[color:var(--m-text)]">
              {category.name}
            </h3>
            <span
              className="text-[15px] font-semibold tabular-nums"
              style={{ color: scoreBarColor(category.score) }}
            >
              {category.score}
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--m-rule-soft)]">
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
          className={`size-4 shrink-0 text-[color:var(--m-text-3)] transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-[var(--m-rule-soft)] px-5 py-4">
          <ul className="grid gap-3">
            {category.checks.map((check) => (
              <li key={check.name} className="flex gap-3">
                {statusIcon[check.status]}
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-[color:var(--m-text)]">
                    {check.name}
                  </p>
                  <p className="text-[12px] text-[color:var(--m-text-3)]">
                    {check.message}
                  </p>
                  {check.details && (
                    <p className="mt-1 truncate text-[11px] font-mono text-[color:var(--m-text-3)] opacity-70">
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

  const progressSteps = [
    "Connecting to site...",
    "Checking Core Web Vitals...",
    "Analyzing SEO...",
    "Scanning mobile responsiveness...",
    "Validating structured data...",
    "Checking SSL certificate...",
    "Running accessibility checks...",
    "Calculating score...",
  ];

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = url.trim();
    if (!cleaned) return;

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

  return (
    <div className="marketing-root min-h-dvh px-5 py-5 md:px-8">
      <div className="relative z-10 mx-auto max-w-[960px] pt-20 pb-16">
        {/* Header */}
        <div className="motion-rise mb-10">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-[13px] font-medium text-[color:var(--m-text-2)] transition-colors hover:text-[color:var(--m-text)]"
          >
            <ArrowLeft className="size-4" />
            Scaffold Web
          </Link>
        </div>

        {/* Input form */}
        {(state === "idle" || state === "error") && (
          <div className="motion-rise">
            <p className="text-[14px] font-medium text-[color:var(--m-text-3)]">
              Free site health audit
            </p>
            <h1 className="mt-4 text-4xl font-semibold leading-[0.94] tracking-normal text-[color:var(--m-text)] sm:text-5xl md:text-6xl">
              How healthy is your website?
            </h1>
            <p className="mt-5 max-w-[620px] text-[17px] leading-[1.7] text-[color:var(--m-text-2)]">
              Enter your website URL and get an instant health score. We check
              speed, SEO, mobile experience, structured data, security, and
              accessibility.
            </p>

            <form
              onSubmit={handleScan}
              className="mt-8 flex flex-col gap-3 sm:flex-row"
            >
              <div className="relative flex-1">
                <Globe className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[color:var(--m-text-3)]" />
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="example.com"
                  autoComplete="url"
                  inputMode="url"
                  className="h-14 w-full rounded-2xl border border-[var(--m-rule)] bg-[var(--m-surface)] pl-12 pr-4 text-[16px] text-[color:var(--m-text)] outline-none transition-colors placeholder:text-[color:var(--m-text-3)] hover:border-[var(--m-rule)] focus:border-[var(--m-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--m-accent)]"
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

            <p className="mt-4 text-[13px] text-[color:var(--m-text-3)]">
              Free. No signup required. 3 scans per day.
            </p>
          </div>
        )}

        {/* Scanning state */}
        {state === "scanning" && (
          <div className="motion-rise">
            <p className="text-[14px] font-medium text-[color:var(--m-text-3)]">
              Scanning
            </p>
            <h2 className="mt-4 text-3xl font-semibold text-[color:var(--m-text)] sm:text-4xl">
              Analyzing your site...
            </h2>
            <p className="mt-3 text-[15px] text-[color:var(--m-text-2)]">
              {url}
            </p>

            <div className="mt-10 grid gap-4 rounded-2xl border border-[var(--m-rule-soft)] bg-[var(--m-panel)] p-6">
              {progressSteps.map((step, i) => (
                <div
                  key={step}
                  className="flex items-center gap-3 transition-opacity duration-300"
                  style={{ opacity: i <= progressStep ? 1 : 0.25 }}
                >
                  {i < progressStep ? (
                    <CheckCircle2 className="size-5 shrink-0 text-[color:var(--m-success)]" />
                  ) : i === progressStep ? (
                    <Loader2 className="size-5 shrink-0 animate-spin text-[color:var(--m-accent)]" />
                  ) : (
                    <div className="size-5 shrink-0 rounded-full border border-[var(--m-rule-soft)]" />
                  )}
                  <span className="text-[14px] text-[color:var(--m-text-2)]">
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

              <h2 className="mt-6 text-3xl font-semibold text-[color:var(--m-text)] sm:text-4xl">
                Site Health Report
              </h2>
              <p className="mt-2 text-[15px] text-[color:var(--m-text-2)]">
                {result.url}
              </p>
              <p className="mt-1 text-[12px] text-[color:var(--m-text-3)]">
                Scanned {new Date(result.scannedAt).toLocaleString()}
              </p>
            </div>

            {/* Category breakdown */}
            <div className="mt-10 grid gap-3">
              {result.categories.map((cat) => (
                <CategoryCard key={cat.slug} category={cat} />
              ))}
            </div>

            {/* CTA */}
            <div className="mt-10 rounded-2xl border border-[var(--m-accent)] bg-[var(--m-accent-faint)] p-6 text-center sm:p-8">
              <h3 className="text-xl font-semibold text-[color:var(--m-text)] sm:text-2xl">
                Your site scored {result.overallScore}/100.
              </h3>
              <p className="mx-auto mt-3 max-w-[480px] text-[15px] leading-[1.6] text-[color:var(--m-text-2)]">
                Scaffold Web builds and manages local business websites that
                score higher — with AI-powered updates, health monitoring, and
                weekly reports.
              </p>
              <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  href="/access-request?ref=audit"
                  className="marketing-button-primary h-12 px-6"
                >
                  Get a free site
                  <ArrowRight className="size-4" />
                </Link>
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
