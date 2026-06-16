/**
 * Shared status-color vocabulary for the admin/operator UI.
 *
 * Before this, the same emerald/amber/red pill classes were redefined as local
 * Record maps in five admin files (overview, audit, ops, onboard, SiteScan).
 * This is the single source of truth: map any domain status to a semantic
 * `Tone`, then look up the pill/dot/text classes. Pure constants — safe to
 * import from server or client components.
 */

export type Tone = "good" | "warn" | "bad" | "info" | "neutral";

/** Bordered pill (border + tinted bg + readable text). */
export const TONE_PILL: Record<Tone, string> = {
  good: "border-emerald-500/25 bg-emerald-500/10 text-emerald-200",
  warn: "border-amber-500/25 bg-amber-500/10 text-amber-200",
  bad: "border-red-500/25 bg-red-500/10 text-red-200",
  info: "border-accent/25 bg-accent/10 text-accent",
  neutral: "border-glass-border bg-gray-bg text-gray-muted",
};

/** Status dot (solid). */
export const TONE_DOT: Record<Tone, string> = {
  good: "bg-emerald-400",
  warn: "bg-amber-400",
  bad: "bg-red-400",
  info: "bg-accent",
  neutral: "bg-gray-faint",
};

/** Text-only tone (for inline emphasis). */
export const TONE_TEXT: Record<Tone, string> = {
  good: "text-emerald-300",
  warn: "text-amber-300",
  bad: "text-red-300",
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
