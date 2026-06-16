"use client";

import { useState } from "react";

interface CheckResult {
  name: string;
  status: "pass" | "warn" | "fail";
  score: number;
  message: string;
}
interface CategoryResult {
  name: string;
  slug: string;
  score: number;
  checks: CheckResult[];
}
interface ScanResult {
  url: string;
  scannedAt: string;
  overallScore: number;
  grade: "A" | "B" | "C" | "D" | "F";
  categories: CategoryResult[];
}

function gradeColor(grade: string): string {
  if (grade === "A" || grade === "B") return "text-emerald-300 border-emerald-500/30 bg-emerald-500/10";
  if (grade === "C") return "text-amber-300 border-amber-500/30 bg-amber-500/10";
  return "text-red-300 border-red-500/30 bg-red-500/10";
}
function barColor(score: number): string {
  if (score >= 80) return "bg-emerald-400";
  if (score >= 55) return "bg-amber-400";
  return "bg-red-400";
}

export function SiteScan({ tenantId }: { tenantId: string }) {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function scan() {
    setScanning(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant: tenantId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setResult(data as ScanResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="rounded-xl bg-glass border border-glass-border p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-warm-white">SEO + site health</h2>
          <p className="mt-0.5 text-xs text-gray-muted">
            Live scan of the client&apos;s public site (SEO, schema, mobile, accessibility, security, speed).
          </p>
        </div>
        <button
          onClick={() => void scan()}
          disabled={scanning}
          className="shrink-0 rounded-md bg-warm-white text-surface-base px-4 py-2 text-sm font-medium disabled:opacity-40"
        >
          {scanning ? "Scanning…" : result ? "Re-scan" : "Run scan"}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

      {result && (
        <div className="mt-5">
          <div className="flex items-center gap-4">
            <div
              className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border text-3xl font-semibold ${gradeColor(result.grade)}`}
            >
              {result.grade}
            </div>
            <div>
              <p className="text-2xl font-semibold text-warm-white">{result.overallScore}/100</p>
              <p className="text-xs text-gray-faint">{result.url.replace(/^https?:\/\//, "")}</p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {result.categories.map((c) => (
              <div key={c.slug}>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-warm-white">{c.name}</span>
                  <span className="text-gray-muted">{c.score}</span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-gray-bg">
                  <div className={`h-1.5 rounded-full ${barColor(c.score)}`} style={{ width: `${c.score}%` }} />
                </div>
                {c.checks.some((ch) => ch.status === "fail") && (
                  <p className="mt-1 text-[11px] text-red-300/80">
                    {c.checks
                      .filter((ch) => ch.status === "fail")
                      .slice(0, 2)
                      .map((ch) => ch.name)
                      .join(" · ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
