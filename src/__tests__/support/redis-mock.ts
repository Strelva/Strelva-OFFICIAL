/**
 * In-memory Redis double covering the subset the orders/leads stores use:
 * a KV with nx/ex-aware set, del, mget, and a score-ordered zset with
 * zadd/zrange/zremrangebyrank. Shared so the two stores test against one mock
 * instead of duplicating it. `store`/`zsets` are exposed for clear() + assertions.
 */
export interface RedisMock {
  store: Map<string, unknown>;
  zsets: Map<string, Map<string, number>>;
  set: (k: string, v: unknown, opts?: { nx?: boolean; ex?: number }) => Promise<"OK" | null>;
  get: (k: string) => Promise<unknown>;
  del: (k: string) => Promise<number>;
  mget: (...keys: string[]) => Promise<unknown[]>;
  zadd: (k: string, e: { score: number; member: string }) => Promise<number>;
  zrange: (k: string, start: number, stop: number, opts?: { rev?: boolean }) => Promise<string[]>;
  zremrangebyrank: (k: string, start: number, stop: number) => Promise<number>;
}

export function makeRedisMock(): RedisMock {
  const store = new Map<string, unknown>();
  const zsets = new Map<string, Map<string, number>>();
  return {
    store,
    zsets,
    set: async (k, v, opts) => {
      if (opts?.nx && store.has(k)) return null;
      store.set(k, v);
      return "OK";
    },
    get: async (k) => store.get(k) ?? null,
    del: async (k) => (store.delete(k) ? 1 : 0),
    mget: async (...keys) => keys.map((k) => store.get(k) ?? null),
    zadd: async (k, { score, member }) => {
      const z = zsets.get(k) ?? new Map<string, number>();
      z.set(member, score);
      zsets.set(k, z);
      return 1;
    },
    zrange: async (k, start, stop, opts) => {
      const z = zsets.get(k) ?? new Map<string, number>();
      let arr = [...z.entries()].sort((a, b) => a[1] - b[1]).map(([m]) => m);
      if (opts?.rev) arr = arr.reverse();
      return arr.slice(start, stop + 1);
    },
    zremrangebyrank: async (k, start, stop) => {
      const z = zsets.get(k);
      if (!z) return 0;
      const asc = [...z.entries()].sort((a, b) => a[1] - b[1]).map(([m]) => m);
      const n = asc.length;
      const s = start < 0 ? Math.max(0, n + start) : start;
      const e = stop < 0 ? n + stop : Math.min(stop, n - 1);
      let removed = 0;
      for (let i = s; i <= e && i < n; i++) {
        if (z.delete(asc[i])) removed++;
      }
      return removed;
    },
  };
}
