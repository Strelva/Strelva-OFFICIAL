/**
 * Postgres dual-path coverage for report-store.
 *
 * Exercises the DATA_SOURCE=postgres branch of saveWeeklyReport / getWeeklyReports:
 *  - the read path maps snake_case `weekly_briefs` rows -> camelCase StoredWeeklyReport
 *  - the write path hits the `weekly_briefs` table with snake_case columns
 *
 * Sanity is forced off (`hasSanity: false`) so ONLY the Postgres branch runs.
 * The Supabase client is a chainable + thenable Proxy builder so list queries
 * (`await builder`) and single queries (`.maybeSingle()`) both resolve.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supa = vi.hoisted(() => ({
  result: { data: null as unknown, error: null as unknown },
  lastTable: "",
  lastInsert: undefined as unknown,
  lastUpdate: undefined as unknown,
  // Queue distinct results for the two awaits in the upsert path
  // (maybeSingle existence check, then the list read), keyed by call.
  maybeSingleResult: { data: null as unknown, error: null as unknown },
}));

function builder(): unknown {
  const p = Promise.resolve(supa.result);
  return new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") return p.then.bind(p);
        if (prop === "maybeSingle" || prop === "single")
          return () => Promise.resolve(supa.maybeSingleResult);
        if (prop === "insert" || prop === "upsert")
          return (v: unknown) => {
            supa.lastInsert = v;
            return builder();
          };
        if (prop === "update")
          return (v: unknown) => {
            supa.lastUpdate = v;
            return builder();
          };
        return () => builder();
      },
    }
  );
}

// Force the Postgres branch: getSupabase() returns a configured client.
vi.mock("@/lib/db/client", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  getSupabase: () => ({
    from: (t: string) => {
      supa.lastTable = t;
      return builder();
    },
  }),
}));

// Force Sanity OFF so only the Postgres path runs. `hasSanity` in core.ts is a
// module-level const evaluated at import time, so stubbing env vars is not enough
// — we mock the module to pin it false.
vi.mock("@/lib/storage/core", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  hasSanity: false,
}));

import { saveWeeklyReport, getWeeklyReports } from "@/lib/storage/report-store";

beforeEach(() => {
  vi.stubEnv("DATA_SOURCE", "postgres");
  vi.stubEnv("NEXT_PUBLIC_SANITY_PROJECT_ID", "");
  vi.stubEnv("SANITY_API_TOKEN", "");
  supa.result = { data: null, error: null };
  supa.maybeSingleResult = { data: null, error: null };
  supa.lastTable = "";
  supa.lastInsert = undefined;
  supa.lastUpdate = undefined;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("report-store Postgres dual-path", () => {
  it("getWeeklyReports maps snake_case weekly_briefs rows to camelCase", async () => {
    // A realistic row as it comes back from Postgres (snake_case columns).
    supa.result = {
      data: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          tenant_id: "gldf",
          week_start: "2026-06-15",
          week_end: "2026-06-21",
          created_at: "2026-06-21T12:00:00.000Z",
          page_views: { total: 120, thisWeek: 30 },
          booking_clicks: { total: 18, thisWeek: 5 },
          top_services: [{ serviceId: "haircut", total: 10, thisWeek: 3 }],
          stale_sections: [{ section: "about", daysSinceUpdate: 42 }],
          summary: "Solid week.",
        },
      ],
      error: null,
    };

    const reports = await getWeeklyReports("gldf", 12);

    expect(supa.lastTable).toBe("weekly_briefs");
    expect(reports).toHaveLength(1);

    const r = reports[0];
    // id is reconstructed deterministically from week_start + tenant_id.
    expect(r.id).toBe("report_2026-06-15_gldf");
    expect(r.weekStart).toBe("2026-06-15");
    expect(r.createdAt).toBe("2026-06-21T12:00:00.000Z");
    // snake_case JSON columns -> camelCase fields, values preserved.
    expect(r.pageViews).toEqual({ total: 120, thisWeek: 30 });
    expect(r.bookingClicks).toEqual({ total: 18, thisWeek: 5 });
    expect(r.topServices).toEqual([{ serviceId: "haircut", total: 10, thisWeek: 3 }]);
    expect(r.staleSections).toEqual([{ section: "about", daysSinceUpdate: 42 }]);
    expect(r.summary).toBe("Solid week.");
    // No stray snake_case keys leaked into the mapped object.
    expect(r).not.toHaveProperty("tenant_id");
    expect(r).not.toHaveProperty("week_start");
  });

  it("getWeeklyReports null-coalesces missing JSON columns to safe defaults", async () => {
    supa.result = {
      data: [
        {
          id: "22222222-2222-2222-2222-222222222222",
          tenant_id: "rohlax",
          week_start: "2026-06-08",
          week_end: "2026-06-14",
          created_at: "2026-06-14T00:00:00.000Z",
          page_views: null,
          booking_clicks: null,
          top_services: null,
          stale_sections: null,
          summary: null,
        },
      ],
      error: null,
    };

    const [r] = await getWeeklyReports("rohlax");

    expect(r.pageViews).toEqual({ total: 0, thisWeek: 0 });
    expect(r.bookingClicks).toEqual({ total: 0, thisWeek: 0 });
    expect(r.topServices).toEqual([]);
    expect(r.staleSections).toEqual([]);
    expect(r.summary).toBe("");
  });

  it("saveWeeklyReport inserts snake_case columns into weekly_briefs", async () => {
    // No existing row -> the upsert takes the INSERT branch.
    supa.maybeSingleResult = { data: null, error: null };

    const stored = await saveWeeklyReport("gldf", {
      pageViews: { total: 200, thisWeek: 50 },
      bookingClicks: { total: 25, thisWeek: 8 },
      topServices: [{ serviceId: "consult", total: 12, thisWeek: 4 }],
      staleSections: [{ section: "hero", daysSinceUpdate: 10 }],
      summary: "Growth.",
    } as unknown as Parameters<typeof saveWeeklyReport>[1]);

    expect(supa.lastTable).toBe("weekly_briefs");

    const insert = supa.lastInsert as Record<string, unknown>;
    expect(insert).toBeTruthy();
    // tenant + week columns are snake_case.
    expect(insert.tenant_id).toBe("gldf");
    expect(typeof insert.week_start).toBe("string");
    expect(typeof insert.week_end).toBe("string");
    // week_end is week_start + 6 days.
    const start = new Date(`${insert.week_start as string}T00:00:00.000Z`);
    const end = new Date(`${insert.week_end as string}T00:00:00.000Z`);
    expect((end.getTime() - start.getTime()) / 86_400_000).toBe(6);
    // camelCase store fields written to snake_case JSON columns, values intact.
    expect(insert.page_views).toEqual({ total: 200, thisWeek: 50 });
    expect(insert.booking_clicks).toEqual({ total: 25, thisWeek: 8 });
    expect(insert.top_services).toEqual([{ serviceId: "consult", total: 12, thisWeek: 4 }]);
    expect(insert.stale_sections).toEqual([{ section: "hero", daysSinceUpdate: 10 }]);
    expect(insert.summary).toBe("Growth.");
    // The store id is NOT persisted (weekly_briefs.id is a DB-default uuid).
    expect(insert).not.toHaveProperty("id");

    // The returned StoredWeeklyReport carries the deterministic store id + values.
    expect(stored.id).toBe(`report_${insert.week_start as string}_gldf`);
    expect(stored.summary).toBe("Growth.");
  });

  it("saveWeeklyReport updates the existing row (no insert) when one exists", async () => {
    // Existence check returns a row -> upsert takes the UPDATE branch.
    supa.maybeSingleResult = {
      data: { id: "33333333-3333-3333-3333-333333333333" },
      error: null,
    };

    await saveWeeklyReport("gldf", {
      pageViews: { total: 1, thisWeek: 1 },
      bookingClicks: { total: 0, thisWeek: 0 },
      topServices: [],
      staleSections: [],
      summary: "Patched.",
    } as unknown as Parameters<typeof saveWeeklyReport>[1]);

    expect(supa.lastTable).toBe("weekly_briefs");
    // Update branch fired; insert did not.
    const update = supa.lastUpdate as Record<string, unknown>;
    expect(update).toBeTruthy();
    expect(update.summary).toBe("Patched.");
    expect(update.page_views).toEqual({ total: 1, thisWeek: 1 });
    // Update payload omits tenant_id (scoped by .eq on the existing id).
    expect(update).not.toHaveProperty("tenant_id");
    expect(supa.lastInsert).toBeUndefined();
  });
});
