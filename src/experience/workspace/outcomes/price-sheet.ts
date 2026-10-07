/** Slide-to-confirm rules for the price sheet. The button is always the equivalent path. */

/** Release past this fraction of the track commits. */
export const SLIDE_COMMIT_THRESHOLD = 0.85;

/** Fraction of the track covered, clamped 0–1. Zero travel is never progress. */
export function slideProgress(offset: number, travel: number): number {
  if (!(travel > 0) || !Number.isFinite(offset)) return 0;
  return Math.min(1, Math.max(0, offset / travel));
}

/** True when a release at `offset` should commit; otherwise the knob springs back. */
export function slideCommits(offset: number, travel: number, threshold = SLIDE_COMMIT_THRESHOLD): boolean {
  return travel > 0 && slideProgress(offset, travel) > threshold;
}

/** "Build it for $120". */
export function confirmLabel(price: number, verb = "Build it"): string {
  return `${verb} for $${Math.round(price).toLocaleString("en-US")}`;
}
