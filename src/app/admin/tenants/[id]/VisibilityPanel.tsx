"use client";

import { useState } from "react";
import type { VisibilityFinding, VisibilitySummary } from "@/lib/visibility/diagnose";
import type { VisibilityDiff } from "@/lib/visibility/snapshots";

interface Props {
  tenantId: string;
  summary: VisibilitySummary | null;
  findings: VisibilityFinding[];
  diff: VisibilityDiff | null;
}

const SURFACE_LABEL: Record<VisibilityFinding["surface"], string> = {
  ai_answer: "AI answer",
  serp_organic: "Google rank",
  serp_local_pack: "Local 3-pack",
};

function diffLine(d: VisibilityDiff): string[] {
  const wins = d.changes.filter((c) => c.direction === "appeared" || c.direction === "improved");
  const losses = d.changes.filter((c) => c.direction === "disappeared" || c.direction === "declined");
  const lines: string[] = [];
  for (const w of wins) lines.push(`▲ ${SURFACE_LABEL[w.surface]} for "${w.query}" — ${w.direction}`);
  for (const l of losses) lines.push(`▼ ${SURFACE_LABEL[l.surface]} for "${l.query}" — ${l.direction}`);
  return lines;
}

export function VisibilityPanel({ tenantId, summary, findings, diff }: Props) {
  const [drafting, setDrafting] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function draftFix(query: string) {
    setDrafting(query);
    setErrors((e) => ({ ...e, [query]: "" }));
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/visibility`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Draft failed");
      setResults((r) => ({ ...r, [query]: data.message || "Draft queued for review." }));
    } catch (err) {
      setErrors((e) => ({ ...e, [query]: err instanceof Error ? err.message : "Draft failed" }));
    } finally {
      setDrafting(null);
    }
  }

  if (!summary) {
    return (
      <div role="status" className="rounded-xl bg-glass border border-glass-border p-5">
        <h2 className="text-sm font-semibold text-warm-white mb-1">AI-search visibility</h2>
        <p className="text-sm text-gray-muted">
          No visibility data yet. The weekly visibility cron measures this once the tenant has a
          <code className="mx-1 text-gray-faint">visibility</code>config block and the SERP/AI keys are set.
        </p>
      </div>
    );
  }

  const trend = diff ? diffLine(diff) : [];

  return (
    <div className="rounded-xl bg-glass border border-glass-border p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-warm-white">AI-search visibility</h2>
        <span className="text-xs text-gray-faint">
          checked {new Date(summary.checkedAt).toLocaleDateString()}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg bg-glass border border-glass-border p-3">
          <p className="text-xs text-gray-muted">In AI answers</p>
          <p className="text-xl font-semibold text-warm-white">{summary.aiPresent}/{summary.aiProbed}</p>
        </div>
        <div className="rounded-lg bg-glass border border-glass-border p-3">
          <p className="text-xs text-gray-muted">Ranking page 1</p>
          <p className="text-xl font-semibold text-warm-white">{summary.serpRanked}/{summary.serpChecked}</p>
        </div>
        <div className="rounded-lg bg-glass border border-glass-border p-3">
          <p className="text-xs text-gray-muted">Local 3-pack</p>
          <p className="text-xl font-semibold text-warm-white">{summary.localPackPresent}/{summary.serpChecked}</p>
        </div>
      </div>

      {trend.length > 0 && (
        <div className="rounded-lg bg-glass border border-glass-border p-3">
          <p className="text-xs font-semibold text-gray-muted mb-1">Since last check</p>
          <ul className="space-y-0.5 text-xs text-gray-muted">
            {trend.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      {findings.length === 0 ? (
        <p className="text-sm text-gray-muted">No visibility gaps found. This client is showing up where it should.</p>
      ) : (
        <ul className="space-y-3">
          {findings.map((f, i) => (
            <li key={i} className="rounded-lg bg-glass border border-glass-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-[10px] uppercase tracking-wide text-gray-faint">
                    {SURFACE_LABEL[f.surface]} · {f.severity}
                  </span>
                  <p className="text-sm text-warm-white mt-0.5">{f.problem}</p>
                  <p className="text-xs text-gray-muted mt-1">{f.recommendation}</p>
                </div>
                {f.actionable === "on_site" && (
                  <button
                    onClick={() => draftFix(f.query)}
                    disabled={drafting === f.query}
                    className="shrink-0 rounded-lg border border-glass-border px-3 py-1.5 text-xs text-warm-white hover:bg-glass-border disabled:opacity-50"
                  >
                    {drafting === f.query ? "Drafting…" : "Draft fix"}
                  </button>
                )}
              </div>
              {results[f.query] && (
                <p className="mt-2 text-xs text-green-300">Queued for review: {results[f.query]}</p>
              )}
              {errors[f.query] && <p className="mt-2 text-xs text-red-300">{errors[f.query]}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
