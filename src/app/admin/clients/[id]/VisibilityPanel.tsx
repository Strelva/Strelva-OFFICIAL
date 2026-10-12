"use client";

import { StTextButton } from "@/components/ui/strelva/Kit";
import { visibilityHeadline } from "@/lib/visibility/diagnose";
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
  for (const w of wins) lines.push(`▲ ${SURFACE_LABEL[w.surface]} for "${w.query}": ${w.direction}`);
  for (const l of losses) lines.push(`▼ ${SURFACE_LABEL[l.surface]} for "${l.query}": ${l.direction}`);
  return lines;
}

export function VisibilityPanel({ summary, findings, diff }: Props) {
  if (!summary) {
    return (
      <div role="status" className="rounded-2xl border border-glass-border bg-glass p-5">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-warm-white mb-1">AI-search visibility</h2>
        <p className="text-sm text-gray-muted">
          Not tracking yet. Strelva checks weekly whether this client shows up in Google + AI answers
          for their trade and town — it starts once the client&apos;s industry and town are set.
        </p>
      </div>
    );
  }

  const trend = diff ? diffLine(diff) : [];
  const headline = visibilityHeadline(summary, findings);

  return (
    <div className="rounded-2xl border border-glass-border bg-glass p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-warm-white">AI-search visibility</h2>
        <span className="text-xs text-gray-faint">
          checked {new Date(summary.checkedAt).toLocaleDateString()}
        </span>
      </div>

      {headline && <p className="text-sm text-warm-white">{headline}</p>}

      <div className="grid grid-cols-1 gap-3 text-center sm:grid-cols-3">
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
                  <span className="text-[11px] uppercase tracking-wide text-gray-faint">
                    {SURFACE_LABEL[f.surface]} · {f.severity}
                  </span>
                  <p className="text-sm text-warm-white mt-0.5">{f.problem}</p>
                  <p className="text-xs text-gray-muted mt-1">{f.impact}</p>
                  {f.quantified && (
                    <p className="text-[11px] font-medium text-accent-text mt-1">{f.quantified}</p>
                  )}
                  <p className="text-xs text-gray-muted mt-1">{f.recommendation}</p>
                </div>
                {f.actionable === "on_site" && (
                  <StTextButton href="/workspace">Open workspace</StTextButton>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
