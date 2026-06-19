/**
 * Per-run windowing for the cost-guarded visibility cron.
 *
 * Visibility probing costs money per tenant (serper.dev + Gemini per query), so
 * a single weekly run is capped at `maxPerRun` tenants. To avoid starving the
 * tail forever, the cap ROTATES by week: over ceil(n/cap) weeks every tenant is
 * covered exactly once, no gaps, no overlap. Pure + deterministic so it's
 * unit-testable (the cron just feeds it the week index).
 */

export interface RunWindow<T> {
  /** The slice of items to process this run. */
  toRun: T[];
  /** How many items are NOT in this run (covered in other weeks). */
  deferred: number;
  /** Number of weekly windows needed to cover everything. */
  windowCount: number;
  /** 1-based index of this run's window (for logging). */
  windowIndex: number;
}

/**
 * Select this run's window. `weekIndex` advances by 1 each week
 * (e.g. floor(now / 7d)), so consecutive weekly runs walk consecutive windows.
 */
export function selectRunWindow<T>(
  items: readonly T[],
  maxPerRun: number,
  weekIndex: number
): RunWindow<T> {
  const cap = Math.max(1, Math.floor(maxPerRun) || 1);
  const windowCount = Math.max(1, Math.ceil(items.length / cap));
  // Modulo that's safe for negative/huge week indexes.
  const w = (((Math.floor(weekIndex) % windowCount) + windowCount) % windowCount);
  const offset = w * cap;
  const toRun = items.slice(offset, offset + cap);
  return { toRun, deferred: items.length - toRun.length, windowCount, windowIndex: w + 1 };
}
