"use client";

import { CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { AiVisibilityResult } from "./contracts";

/**
 * The smallest work shape needed by this product renderer.
 *
 * It is intentionally structural rather than an import of the workspace
 * contract. Hosts can pass their own saved-work record without making this
 * product depend on the experience layer.
 */
export interface AiVisibilityAssessmentWork {
  productId: string;
  title: string;
  payload: AiVisibilityResult | null;
  createdAt: string;
  unavailableReason?: string;
}

export interface AiVisibilityAssessmentResultProps {
  work: AiVisibilityAssessmentWork;
  onRetry?: () => void;
  accessLabel?: string;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Saved recently";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function resultTone(score: number): { text: string; ring: string; wash: string } {
  if (score >= 80) return { text: "text-positive", ring: "border-positive/70", wash: "bg-positive/10" };
  if (score >= 60) return { text: "text-accent-text", ring: "border-accent/60", wash: "bg-accent-dim" };
  if (score >= 40) return { text: "text-warning", ring: "border-warning/60", wash: "bg-warning/10" };
  return { text: "text-critical", ring: "border-critical/60", wash: "bg-critical/10" };
}

/**
 * Product-owned renderer for a saved AI Visibility assessment.
 *
 * Unsupported products and corrupt payloads render a bounded unavailable
 * state. No unparsed payload or host-private fields are read or displayed.
 */
export function AiVisibilityAssessmentResult({
  work,
  onRetry,
  accessLabel = "Access controlled by this workspace",
}: AiVisibilityAssessmentResultProps) {
  if (work.productId !== "ai_visibility" || !work.payload) {
    return (
      <article className="mx-auto max-w-3xl">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted">{work.productId}</p>
        <h1 className="mt-4 font-display text-[34px] font-medium leading-tight text-warm-black sm:text-[44px]">{work.title}</h1>
        <div className="mt-8 border-y border-gray-border py-7">
          <p className="text-[14px] font-medium text-warm-black">This saved work cannot be displayed here.</p>
          <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-gray-muted">{work.unavailableReason || "Its product view is not available in this release. The saved record has not been removed."}</p>
        </div>
      </article>
    );
  }

  const result = work.payload;
  const scoreMeasured = result.measurementStatus !== "unavailable" && result.readinessMeasured !== false;
  const partial = result.measurementStatus === "partial";
  const tone = resultTone(result.score);

  return (
    <article className="mx-auto max-w-4xl">
      <header className="grid items-center gap-8 border-b border-gray-border pb-9 sm:grid-cols-[1fr_auto]">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted">AI Visibility assessment</p>
          <h1 className="mt-3 font-display text-[34px] font-medium leading-tight text-warm-black sm:text-[44px]">{result.business}</h1>
          {result.url ? <p className="mt-2 break-all text-[13px] text-gray-muted">{result.url}</p> : null}
          <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-gray-fg">{result.verdict}</p>
        </div>
        {!scoreMeasured ? (
          <div className="w-full max-w-[190px] border-l-2 border-warning pl-5 sm:w-[190px]" role="status">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-warning">Not measured</p>
            <p className="mt-2 text-[12px] leading-relaxed text-gray-muted">{result.measurementNote || "The required evidence was unavailable, so Strelva did not calculate a grade."}</p>
            {onRetry ? <Button type="button" size="sm" variant="secondary" className="mt-4" onClick={onRetry}>Retry assessment</Button> : null}
          </div>
        ) : (
          <div>
            <div className={`flex h-32 w-32 shrink-0 items-center justify-center rounded-full border-[5px] ${tone.ring} ${tone.wash}`} aria-label={`Grade ${result.grade}, ${result.score} out of 100`}>
              <div className="text-center"><div className={`font-display text-[48px] leading-none ${tone.text}`}>{result.grade}</div><div className={`mt-1 text-[12px] font-semibold tabular-nums ${tone.text}`}>{result.score}/100</div></div>
            </div>
            {partial ? <p className="mt-3 max-w-40 text-center text-[11px] leading-relaxed text-warning">{result.measurementNote || "Partial measurement"}</p> : null}
          </div>
        )}
      </header>

      <section className="grid gap-8 py-9 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-muted">Evidence</h2>
          <ul className="mt-4 divide-y divide-gray-border border-y border-gray-border">
            {result.signals.map((signal) => (
              <li key={signal.id} className="flex gap-3 py-4">
                {signal.pass ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-positive" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-critical" />}
                <div><div className="flex flex-wrap items-baseline gap-x-2"><h3 className="text-[14px] font-medium text-warm-black">{signal.label}</h3><span className="text-[11px] text-gray-faint">{signal.weight} points</span></div><p className="mt-1 text-[13px] leading-relaxed text-gray-muted">{signal.detail}</p></div>
              </li>
            ))}
          </ul>
        </div>
        <aside className="space-y-6">
          <div className="border-l-2 border-accent pl-5"><p className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent-text">Do this first</p><p className="mt-2 text-[14px] font-medium leading-relaxed text-warm-black">{result.topFix}</p></div>
          <div className="border-t border-gray-border pt-5"><p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-muted">AI citation probe</p><p className="mt-2 text-[13px] leading-relaxed text-gray-muted">{result.citation.note}</p><p className="mt-3 flex items-center gap-1.5 text-[11px] text-gray-faint"><ShieldCheck className="h-3.5 w-3.5" />{result.citation.probed ? "Probe completed" : "Probe not completed"}</p></div>
          <p className="border-t border-gray-border pt-5 text-[11px] text-gray-faint">Saved {formatDate(work.createdAt)} · {accessLabel}</p>
        </aside>
      </section>
    </article>
  );
}
