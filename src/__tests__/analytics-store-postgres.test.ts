/**
 * Postgres dual-path coverage for analytics-store (DATA_SOURCE=postgres).
 *
 * Validates that with the flag on:
 *  - reads come off the Postgres `site_metrics` table (snake_case columns
 *    metric/day/count) and get mapped into the store's camelCase shapes, and
 *  - writes hit `site_metrics` with the right snake_case columns.
 *
 * Sanity is forced OFF (core.hasSanity=false) so only the Postgres branch runs;
 * the Supabase client is mocked with a chainable+thenable builder so both list
 * queries (await builder) and single queries (.maybeSingle()) resolve.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supa = vi.hoisted(() => ({
  result: { data: null as unknown, error: null as unknown },
  lastTable: "",
  lastInsert: undefined as unknown,
  lastUpsert: undefined as unknown,
}));

function builder(): unknown {
  const p = Promise.resolve(supa.result);
  return new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") return p.then.bind(p);
        if (prop === "maybeSingle" || prop === "single") return () => Promise.resolve(supa.result);
        if (prop === "insert") return (v: unknown) => { supa.lastInsert = v; return builder(); };
        if (prop === "upsert") return (v: unknown) => { supa.lastUpsert = v; return builder(); };
        return () => builder();
      },
    }
  );
}

// Supabase: a configured client whose every table query goes through `builder`.
vi.mock("@/lib/db/client", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getSupabase: () => ({
    from: (t: string) => {
      supa.lastTable = t;
      return builder();
    },
  }),
}));

// Force Sanity OFF so the store takes the Postgres-only branch (no fall-through).
// `hasSanity` is a module-const, so it must be mocked rather than env-stubbed.
vi.mock("@/lib/storage/core", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  hasSanity: false,
}));

import {
  trackClick,
  getClickCounts,
  getLastClickDate,
  getDailyMetrics,
  getClickCountsByPrefix,
  getSectionTimestamps,
} from "@/lib/storage/analytics-store";

const TENANT = "gldf";
const today = new Date().toISOString().slice(0, 10);
function dayOffset(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

beforeEach(() => {
  vi.stubEnv("DATA_SOURCE", "postgres");
  supa.result = { data: null, error: null };
  supa.lastInsert = undefined;
  supa.lastUpsert = undefined;
  supa.lastTable = "";
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("analytics-store Postgres dual-path", () => {
  it("getClickCounts maps site_metrics rows into total/today/thisWeek/lastWeek", async () => {
    // snake_case rows exactly as `site_metrics` returns them (metric/day/count).
    supa.result = {
      data: [
        { day: today, count: 3 },
        { day: dayOffset(2), count: 2 }, // within this week
        { day: dayOffset(8), count: 5 }, // last week
      ],
      error: null,
    };

    const counts = await getClickCounts("booking-click", TENANT);

    expect(supa.lastTable).toBe("site_metrics");
    expect(counts).toEqual({ total: 10, today: 3, thisWeek: 5, lastWeek: 5 });
  });

  it("getLastClickDate returns the newest day from site_metrics rows", async () => {
    supa.result = {
      data: [
        { day: dayOffset(5), count: 1 },
        { day: dayOffset(1), count: 1 },
        { day: dayOffset(9), count: 1 },
      ],
      error: null,
    };

    const last = await getLastClickDate("page-view", TENANT);

    expect(supa.lastTable).toBe("site_metrics");
    expect(last).toBe(dayOffset(1));
  });

  it("getDailyMetrics buckets page-view/booking-click rows by day into camelCase shape", async () => {
    // Both pgMetricRows calls (page-view then booking-click) read the same mocked
    // result; assert the mapper bucketed counts under the right camelCase keys.
    supa.result = {
      data: [
        { day: today, count: 4 },
        { day: dayOffset(1), count: 1 },
      ],
      error: null,
    };

    const metrics = await getDailyMetrics(TENANT, 3);

    expect(supa.lastTable).toBe("site_metrics");
    expect(metrics).toHaveLength(3);
    const todayRow = metrics.find((m) => m.date === today)!;
    expect(todayRow).toMatchObject({ date: today, pageViews: 4, bookingClicks: 4 });
    // snake_case -> camelCase: pageViews / bookingClicks keys exist on every row.
    for (const row of metrics) {
      expect(row).toHaveProperty("pageViews");
      expect(row).toHaveProperty("bookingClicks");
    }
  });

  it("getClickCountsByPrefix groups matching metrics into { total, thisWeek }", async () => {
    supa.result = {
      data: [
        { metric: "cta-hero", day: today, count: 2 },
        { metric: "cta-hero", day: dayOffset(10), count: 3 }, // outside week
        { metric: "cta-footer", day: today, count: 1 },
        { metric: "nav-click", day: today, count: 9 }, // wrong prefix, excluded
      ],
      error: null,
    };

    const byPrefix = await getClickCountsByPrefix("cta-", TENANT);

    expect(supa.lastTable).toBe("site_metrics");
    expect(byPrefix).toEqual({
      "cta-hero": { total: 5, thisWeek: 2 },
      "cta-footer": { total: 1, thisWeek: 1 },
    });
    expect(byPrefix["nav-click"]).toBeUndefined();
  });

  it("trackClick writes the today counter to site_metrics with snake_case columns", async () => {
    // First call (.maybeSingle()) returns the existing count; the upsert follows.
    supa.result = { data: { count: 6 }, error: null };

    await trackClick("booking-click", TENANT);

    expect(supa.lastTable).toBe("site_metrics");
    expect(supa.lastUpsert).toEqual({
      tenant_id: TENANT,
      metric: "booking-click",
      day: today,
      count: 7, // existing 6 + 1
    });
  });

  it("trackClick starts the counter at 1 when no prior row exists", async () => {
    supa.result = { data: null, error: null };

    await trackClick("page-view", TENANT);

    expect(supa.lastUpsert).toMatchObject({
      tenant_id: TENANT,
      metric: "page-view",
      day: today,
      count: 1,
    });
  });

  it("getSectionTimestamps reads content.updated_at per section (Postgres equivalent of Sanity _updatedAt)", async () => {
    supa.result = {
      data: [
        { section: "hero", updated_at: "2026-06-20T10:00:00.000Z" },
        { section: "services", updated_at: "2026-06-19T08:00:00.000Z" },
      ],
      error: null,
    };
    const ts = await getSectionTimestamps("gldf");
    expect(supa.lastTable).toBe("content");
    expect(ts).toEqual({
      hero: "2026-06-20T10:00:00.000Z",
      services: "2026-06-19T08:00:00.000Z",
    });
  });
});
