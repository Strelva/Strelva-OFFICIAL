"use client";

import { StCopy, StEmpty, StHead, StMono, StNotice, StPage, StPill, StRow, StRows, StSection, StState } from "@/components/ui/strelva/Kit";
import styles from "./answer-check.module.css";
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
  if (work.productId !== "ai_visibility" || !work.payload) return <StPage><StHead title={work.title} /><StEmpty>This saved work cannot be displayed here.</StEmpty><StCopy muted>{work.unavailableReason || "Its product view is not available in this release. The saved record has not been removed."}</StCopy></StPage>;
  const result = work.payload;
  const measured = result.measurementStatus !== "unavailable" && result.readinessMeasured !== false;
  const copy = (value: string) => value.replace(/\bAI\b/g, "assistants").replace(/\bagents?\b/gi, "assistants");
  return <StPage><StHead title={result.business} meta="Gemini business check" />{result.url ? <StMono>{result.url}</StMono> : null}<StCopy>{copy(result.verdict)}</StCopy>
    {!measured ? <StNotice tone="need"><span>Not measured</span> · {copy(result.measurementNote || "The required evidence was unavailable, so Strelva did not calculate a grade.")}</StNotice> : <span role="img" aria-label={`Grade ${result.grade}, ${result.score} out of 100${result.measurementStatus === "partial" ? ", partial measurement" : ""}`}><StMono>{result.grade} · {result.score}/100{result.measurementStatus === "partial" ? " · Partial measurement" : ""}</StMono></span>}
    {measured && result.measurementStatus === "partial" ? <StNotice>{copy(result.measurementNote || "Only part of this check completed.")}</StNotice> : null}
    <div className={styles.split}><StSection title="Website evidence">{result.signals.length ? <StRows>{result.signals.map(signal => <StRow key={signal.id} title={copy(signal.label)} detail={copy(signal.detail)} end={<StState kind={signal.pass ? "live" : "down"}>{signal.pass ? "Found" : "Missing"}</StState>} />)}</StRows> : <StEmpty>Website readability was not measured.</StEmpty>}</StSection><div className={styles.stack}><StSection title="Do this first"><StCopy>{copy(result.topFix)}</StCopy></StSection><StSection title="One Gemini answer"><StCopy muted>{copy(result.citation.note)}</StCopy><StState kind={result.citation.probed ? "live" : "draft"}>{result.citation.probed ? "Probe completed" : "Probe not completed"}</StState></StSection><StCopy muted>Saved {formatDate(work.createdAt)} · {accessLabel}</StCopy></div></div>
    {onRetry ? <StPill variant="soft" onClick={onRetry}>Retry assessment</StPill> : null}
  </StPage>;
}
