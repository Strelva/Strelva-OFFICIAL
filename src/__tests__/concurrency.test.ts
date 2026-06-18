import { describe, expect, it } from "vitest";
import { mapPool } from "../lib/concurrency";

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe("mapPool", () => {
  it("never exceeds the concurrency bound", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = Array.from({ length: 30 }, (_, i) => i);
    await mapPool(items, 4, async (n) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await tick(1);
      inFlight--;
      return n;
    });
    expect(maxInFlight).toBeLessThanOrEqual(4);
    expect(maxInFlight).toBeGreaterThan(1); // actually ran concurrently
  });

  it("returns results in input order regardless of completion order", async () => {
    const items = [50, 10, 30, 5, 20];
    const out = await mapPool(items, 3, async (ms) => {
      await tick(ms);
      return ms * 2;
    });
    expect(out).toEqual([100, 20, 60, 10, 40]);
  });

  it("isolates per-item failure when fn catches its own errors (cron pattern)", async () => {
    const items = [1, 2, 3, 4, 5];
    const processed: number[] = [];
    const out = await mapPool(items, 2, async (n) => {
      try {
        if (n === 3) throw new Error("boom");
        processed.push(n);
        return { ok: true, n };
      } catch {
        return { ok: false, n };
      }
    });
    expect(processed.sort()).toEqual([1, 2, 4, 5]);
    expect(out.find((r) => r.n === 3)).toEqual({ ok: false, n: 3 });
  });

  it("still drains every item before rejecting on an uncaught throw", async () => {
    const items = [1, 2, 3, 4];
    const started: number[] = [];
    await expect(
      mapPool(items, 4, async (n) => {
        started.push(n);
        await tick(1);
        if (n === 2) throw new Error("kaboom");
        return n;
      })
    ).rejects.toThrow("kaboom");
    // all four were started even though item 2 threw
    expect(started.sort()).toEqual([1, 2, 3, 4]);
  });

  it("handles an empty list", async () => {
    expect(await mapPool([], 8, async () => 1)).toEqual([]);
  });
});
