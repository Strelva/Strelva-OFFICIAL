import { describe, expect, it } from "vitest";
import { selectRunWindow } from "../lib/visibility/schedule";

const ids = (n: number) => Array.from({ length: n }, (_, i) => i);

describe("selectRunWindow — cost-guard rotation", () => {
  it("returns everything in one window when n <= cap", () => {
    const w = selectRunWindow(ids(3), 50, 12345);
    expect(w.toRun).toEqual([0, 1, 2]);
    expect(w.deferred).toBe(0);
    expect(w.windowCount).toBe(1);
    expect(w.windowIndex).toBe(1);
  });

  it("covers EVERY item exactly once over a full cycle — no gaps, no overlap", () => {
    for (const [n, cap] of [[120, 50], [100, 50], [101, 50], [50, 50], [7, 3], [10, 3]] as const) {
      const windowCount = Math.ceil(n / cap);
      const seen = new Set<number>();
      for (let week = 0; week < windowCount; week++) {
        const { toRun } = selectRunWindow(ids(n), cap, week);
        for (const x of toRun) {
          expect(seen.has(x)).toBe(false); // no overlap across the cycle
          seen.add(x);
        }
      }
      expect(seen.size).toBe(n); // every item covered
    }
  });

  it("advances one window per week and wraps cleanly", () => {
    const n = 120, cap = 50; // 3 windows
    expect(selectRunWindow(ids(n), cap, 0).toRun[0]).toBe(0);
    expect(selectRunWindow(ids(n), cap, 1).toRun[0]).toBe(50);
    expect(selectRunWindow(ids(n), cap, 2).toRun[0]).toBe(100);
    expect(selectRunWindow(ids(n), cap, 3).toRun[0]).toBe(0); // wraps back
    expect(selectRunWindow(ids(n), cap, 2).toRun.length).toBe(20); // last window is the remainder
    expect(selectRunWindow(ids(n), cap, 2).deferred).toBe(100);
  });

  it("reports deferred + window count correctly", () => {
    const w = selectRunWindow(ids(120), 50, 1);
    expect(w.windowCount).toBe(3);
    expect(w.windowIndex).toBe(2);
    expect(w.toRun.length).toBe(50);
    expect(w.deferred).toBe(70);
  });

  it("is robust to a 0/negative cap and an empty list", () => {
    expect(selectRunWindow(ids(5), 0, 0).toRun.length).toBe(1); // cap floored to >=1
    expect(selectRunWindow([], 50, 7)).toMatchObject({ toRun: [], deferred: 0, windowCount: 1 });
  });
});
