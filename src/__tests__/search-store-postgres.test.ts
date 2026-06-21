/**
 * Postgres dual-path tests for search-store (DATA_SOURCE=postgres).
 *
 * Validates the snake_case<->camelCase mapping AND that the Postgres branch is
 * taken. Sanity is forced off (mock `./core` -> hasSanity: false) so only the
 * Postgres path runs; the Supabase client is a chainable+thenable Proxy so both
 * list-style awaits and `.maybeSingle()` resolve to the staged result.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supa = vi.hoisted(() => ({
  result: { data: null as unknown, error: null as unknown },
  lastTable: "",
  lastInsert: undefined as unknown,
  lastUpsertOpts: undefined as unknown,
}));

function builder(): unknown {
  const p = Promise.resolve(supa.result);
  return new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") return p.then.bind(p);
        if (prop === "maybeSingle" || prop === "single") return () => Promise.resolve(supa.result);
        if (prop === "insert" || prop === "upsert") {
          return (v: unknown, opts?: unknown) => {
            supa.lastInsert = v;
            supa.lastUpsertOpts = opts;
            return builder();
          };
        }
        return () => builder();
      },
    },
  );
}

vi.mock("@/lib/db/client", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getSupabase: () => ({
    from: (t: string) => {
      supa.lastTable = t;
      return builder();
    },
  }),
}));

// Force Sanity off so getSearchData/setSearchData take ONLY the Postgres branch.
vi.mock("@/lib/storage/core", () => ({ hasSanity: false }));

import { getSearchData, setSearchData } from "@/lib/storage/search-store";
import type { SearchData } from "@/lib/types";

beforeEach(() => {
  vi.stubEnv("DATA_SOURCE", "postgres");
  supa.result = { data: null, error: null };
  supa.lastTable = "";
  supa.lastInsert = undefined;
  supa.lastUpsertOpts = undefined;
});

afterEach(() => vi.unstubAllEnvs());

describe("search-store Postgres read mapping", () => {
  it("getSearchData maps a snake_case row to the camelCase SearchData shape", async () => {
    // Real columns from database.types.ts search_console_data.Row.
    supa.result = {
      data: {
        tenant_id: "gldf",
        queries: [{ query: "yoga buffalo", clicks: 12, impressions: 340, position: 4.2 }],
        total_clicks: 12,
        total_impressions: 340,
        fetched_at: "2026-06-19T00:00:00.000Z",
      },
      error: null,
    };

    const out = await getSearchData("gldf");

    expect(supa.lastTable).toBe("search_console_data");
    expect(out).toEqual({
      queries: [{ query: "yoga buffalo", clicks: 12, impressions: 340, position: 4.2 }],
      totalClicks: 12,
      totalImpressions: 340,
      fetchedAt: "2026-06-19T00:00:00.000Z",
    });
  });

  it("getSearchData applies defaults for null numeric columns", async () => {
    supa.result = {
      data: {
        tenant_id: "gldf",
        queries: null,
        total_clicks: null,
        total_impressions: null,
        fetched_at: "2026-06-19T00:00:00.000Z",
      },
      error: null,
    };

    const out = await getSearchData("gldf");

    expect(out).toEqual({
      queries: [],
      totalClicks: 0,
      totalImpressions: 0,
      fetchedAt: "2026-06-19T00:00:00.000Z",
    });
  });

  it("getSearchData returns null when the Postgres row is absent (Sanity off)", async () => {
    supa.result = { data: null, error: null };
    const out = await getSearchData("gldf");
    expect(out).toBeNull();
  });
});

describe("search-store Postgres write mapping", () => {
  it("setSearchData upserts the right table with snake_case columns on tenant_id conflict", async () => {
    const data: SearchData = {
      queries: [{ query: "trades near me", clicks: 5, impressions: 100, position: 2.1 }],
      totalClicks: 5,
      totalImpressions: 100,
      fetchedAt: "2026-06-19T12:00:00.000Z",
    };

    await setSearchData("gldf", data);

    expect(supa.lastTable).toBe("search_console_data");
    expect(supa.lastInsert).toEqual({
      tenant_id: "gldf",
      queries: [{ query: "trades near me", clicks: 5, impressions: 100, position: 2.1 }],
      total_clicks: 5,
      total_impressions: 100,
      fetched_at: "2026-06-19T12:00:00.000Z",
    });
    expect(supa.lastUpsertOpts).toEqual({ onConflict: "tenant_id" });
  });
});
