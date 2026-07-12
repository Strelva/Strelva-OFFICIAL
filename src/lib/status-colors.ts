/**
 * Shared status-color vocabulary for the admin/operator UI.
 *
 * Before this, the same status pill classes were redefined as local Record maps
 * in five admin files (overview, audit, ops, onboard, SiteScan). This is the
 * single source of truth: map any domain status to a semantic `Tone`, then look
 * up the pill/dot/text classes — which resolve to the brand tokens
 * (positive/warning/critical), never raw palette shades. Pure constants — safe
 * to import from server or client components.
 */

export type Tone = "good" | "warn" | "bad" | "info" | "neutral";

/** Bordered pill (border + tinted bg + readable text). */
export const TONE_PILL: Record<Tone, string> = {
  good: "border-positive/25 bg-positive/10 text-positive",
  warn: "border-warning/25 bg-warning/10 text-warning",
  bad: "border-critical/25 bg-critical/10 text-critical",
  info: "border-accent/25 bg-accent/10 text-accent",
  neutral: "border-glass-border bg-gray-bg text-gray-muted",
};

/** Status dot (solid). */
export const TONE_DOT: Record<Tone, string> = {
  good: "bg-positive",
  warn: "bg-warning",
  bad: "bg-critical",
  info: "bg-accent",
  neutral: "bg-gray-faint",
};

/** Text-only tone (for inline emphasis). */
export const TONE_TEXT: Record<Tone, string> = {
  good: "text-positive",
  warn: "text-warning",
  bad: "text-critical",
  info: "text-accent",
  neutral: "text-gray-muted",
};

export type LetterGrade = "A" | "B" | "C" | "D" | "F";

export function gradeTone(grade: LetterGrade): Tone {
  if (grade === "A" || grade === "B") return "good";
  if (grade === "C") return "warn";
  return "bad";
}

export function launchTone(status: "ready" | "watch" | "blocked"): Tone {
  return status === "ready" ? "good" : status === "watch" ? "warn" : "bad";
}

/** Audit/health check result → tone. */
export function checkTone(status: "pass" | "warn" | "fail" | "ok" | "error"): Tone {
  if (status === "pass" || status === "ok") return "good";
  if (status === "warn") return "warn";
  return "bad";
}

/** A 0-100 score → tone (used by scan category bars). */
export function scoreTone(score: number): Tone {
  if (score >= 80) return "good";
  if (score >= 55) return "warn";
  return "bad";
}
