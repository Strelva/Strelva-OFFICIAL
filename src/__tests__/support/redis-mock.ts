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
  zadd: (
    k: string,
    a: { score: number; member: string } | { nx?: boolean },
    b?: { score: number; member: string },
  ) => Promise<number>;
  zrange: (k: string, start: number, stop: number, opts?: { rev?: boolean; withScores?: boolean }) => Promise<(string | number)[]>;
  zremrangebyrank: (k: string, start: number, stop: number) => Promise<number>;
  zrem: (k: string, ...members: string[]) => Promise<number>;
  zcard: (k: string) => Promise<number>;
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
    zadd: async (k, a, b) => {
      // Supports both zadd(key, entry) and zadd(key, { nx }, entry).
      const entry = b ?? (a as { score: number; member: string });
      const nx = b ? Boolean((a as { nx?: boolean }).nx) : false;
      const z = zsets.get(k) ?? new Map<string, number>();
      if (nx && z.has(entry.member)) return 0;
      z.set(entry.member, entry.score);
      zsets.set(k, z);
      return 1;
    },
    zrange: async (k, start, stop, opts) => {
      const z = zsets.get(k) ?? new Map<string, number>();
      let entries = [...z.entries()].sort((a, b) => a[1] - b[1]);
      if (opts?.rev) entries = entries.reverse();
      const end = stop < 0 ? entries.length + stop + 1 : stop + 1;
      const page = entries.slice(start, end);
      return opts?.withScores ? page.flatMap(([m, score]) => [m, score]) : page.map(([m]) => m);
    },
    zrem: async (k, ...members) => {
      const z = zsets.get(k);
      if (!z) return 0;
      let removed = 0;
      for (const m of members) if (z.delete(m)) removed++;
      return removed;
    },
    zcard: async (k) => zsets.get(k)?.size ?? 0,
    zremrangebyrank: async (k, start, stop) => {
      const z = zsets.get(k);
      if (!z) return 0;
      const asc = [...z.entries()].sort((a, b) => a[1] - b[1]).map(([m]) => m);
      const n = asc.length;
      const s = start < 0 ? Math.max(0, n + start) : start;
      const e = stop < 0 ? n + stop : Math.min(stop, n - 1);
      let removed = 0;
      for (let i = s; i <= e && i < n; i++) {
        if (z.delete(asc[i]!)) removed++;
      }
      return removed;
    },
  };
}
