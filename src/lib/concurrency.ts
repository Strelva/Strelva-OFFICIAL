/**
 * Bounded-concurrency helpers for the per-tenant cron fan-outs.
 *
 * The heavy crons (weekly-report, visibility, polls, staleness) loop over every
 * active tenant inline — fine at 3 tenants, but a serial loop blows Vercel's
 * 300s function timeout somewhere around 30-50 tenants, and an unbounded
 * Promise.all would open ~6N Redis/HTTP connections at once. mapPool keeps a
 * fixed number of tasks in flight: ~Nx faster than serial without the
 * connection storm. Queue-later (QStash) is the eventual model past ~20 paying
 * clients (see docs/operations.md); this raises the ceiling without new infra.
 */

const DEFAULT_CONCURRENCY = 8;

/**
 * Map `fn` over `items` with at most `concurrency` tasks in flight at once.
 * Results are returned in input order. If a task rejects, every in-flight task
 * is still awaited (no dangling promises) before mapPool rejects with the first
 * error — so callers that need per-item isolation give `fn` its own try/catch
 * (as the crons do) and mapPool then never rejects.
 */
export async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const limit = Math.max(1, Math.floor(concurrency) || DEFAULT_CONCURRENCY);
  const results: R[] = new Array(items.length);
  let next = 0;
  let firstError: unknown = undefined;
  let hasError = false;

  async function worker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = await fn(items[i]!, i);
      } catch (err) {
        // Capture the first error but keep draining so in-flight work finishes
        // and we don't leave unhandled rejections behind.
        if (!hasError) {
          hasError = true;
          firstError = err;
        }
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);

  if (hasError) throw firstError;
  return results;
}
