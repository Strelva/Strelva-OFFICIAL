/**
 * Postgres dual-path coverage for the suggestions store.
 *
 * Exercises the DATA_SOURCE=postgres branch end to end against a mocked Supabase
 * client. The point is real validation of the row <-> Suggestion mapping
 * (snake_case columns <-> camelCase `Suggestion`) and that the Postgres branch
 * is actually taken — not coverage padding.
 *
 * Sanity is disabled (env unset -> `hasSanity` false) so the Postgres path is
 * the only store touched, and `addEvent` is stubbed so the write path doesn't
 * reach Redis.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mutable test state shared with the hoisted mock.
const supa = vi.hoisted(() => ({
  result: { data: null as unknown, error: null as unknown },
  lastTable: "",
  lastInsert: undefined as unknown,
}));

// Chainable + thenable builder: `await builder()` resolves the list result,
// `.maybeSingle()`/`.single()` resolve the same, `.insert()`/`.upsert()` capture
// the written rows, and every other method (select/eq/is/order/update/limit)
// returns a fresh builder so both list queries and single queries work.
function builder(): unknown {
  const p = Promise.resolve(supa.result);
  return new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") return p.then.bind(p);
        if (prop === "maybeSingle" || prop === "single")
          return () => Promise.resolve(supa.result);
        if (prop === "insert" || prop === "upsert")
          return (v: unknown) => {
            supa.lastInsert = v;
            return builder();
          };
        return () => builder();
      },
    }
  );
}

vi.mock("@/lib/db/client", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  getSupabase: () => ({
    from: (t: string) => {
      supa.lastTable = t;
      return builder();
    },
  }),
}));

// Suggestion creation fires an event into the Redis-backed event queue; stub it
// so only the Postgres suggestion write is observed.
vi.mock("@/lib/events", () => ({ addEvent: vi.fn().mockResolvedValue(undefined) }));

import { getSuggestions, addSuggestion, updateSuggestion } from "@/lib/suggestions";

beforeEach(() => {
  vi.stubEnv("DATA_SOURCE", "postgres");
  vi.stubEnv("NEXT_PUBLIC_SANITY_PROJECT_ID", "");
  vi.stubEnv("SANITY_API_TOKEN", "");
  supa.result = { data: null, error: null };
  supa.lastTable = "";
  supa.lastInsert = undefined;
});

afterEach(() => vi.unstubAllEnvs());

describe("suggestions store postgres path", () => {
  it("getSuggestions maps snake_case suggestion rows into camelCase Suggestions", async () => {
    supa.result = {
      data: [
        {
          id: "sug_1",
          tenant_id: "gldf",
          type: "stale",
          title: "Freshen up your hero",
          description: "Hero is stale.",
          action: "update_section:hero",
          section: "hero",
          status: "pending",
          created_at: "2026-06-20T00:00:00.000Z",
        },
        {
          id: "sug_2",
          tenant_id: "gldf",
          type: "missing",
          title: "Add more reviews",
          description: "Need 3+ reviews.",
          action: "prompt:add a testimonial",
          section: null,
          status: "pending",
          created_at: "2026-06-19T00:00:00.000Z",
        },
      ],
      error: null,
    };

    const suggestions = await getSuggestions("gldf");

    expect(suggestions).toEqual([
      {
        id: "sug_1",
        tenantId: "gldf",
        type: "stale",
        title: "Freshen up your hero",
        description: "Hero is stale.",
        action: "update_section:hero",
        section: "hero",
        status: "pending",
        createdAt: "2026-06-20T00:00:00.000Z",
      },
      {
        id: "sug_2",
        tenantId: "gldf",
        type: "missing",
        title: "Add more reviews",
        description: "Need 3+ reviews.",
        action: "prompt:add a testimonial",
        // null `section` column maps to undefined.
        section: undefined,
        status: "pending",
        createdAt: "2026-06-19T00:00:00.000Z",
      },
    ]);
    // Confirms the Postgres branch was the source of this read.
    expect(supa.lastTable).toBe("suggestions");
  });

  it("addSuggestion writes a snake_case row to the suggestions table", async () => {
    // No pending duplicate found (data stays empty), so a real insert happens.
    const created = await addSuggestion({
      tenantId: "gldf",
      type: "missing",
      title: "Add an upcoming event",
      description: "Events give people a reason to visit.",
      action: "prompt:Help me create an event",
      section: "events",
    });

    expect(supa.lastTable).toBe("suggestions");
    expect(supa.lastInsert).toEqual({
      id: created.id,
      tenant_id: "gldf",
      type: "missing",
      title: "Add an upcoming event",
      description: "Events give people a reason to visit.",
      action: "prompt:Help me create an event",
      section: "events",
      status: "pending",
      created_at: created.createdAt,
    });
    // A sectionless suggestion would still serialize section as null, but this
    // one has a section; sanity-check the returned shape too.
    expect(created.tenantId).toBe("gldf");
    expect(created.status).toBe("pending");
  });

  it("addSuggestion returns the existing pending duplicate instead of inserting", async () => {
    // pgFindPendingDuplicate sees a matching pending row -> early return.
    supa.result = {
      data: [
        {
          id: "sug_existing",
          tenant_id: "gldf",
          type: "missing",
          title: "Add an upcoming event",
          description: "Already suggested.",
          action: "prompt:Help me create an event",
          section: "events",
          status: "pending",
          created_at: "2026-06-18T00:00:00.000Z",
        },
      ],
      error: null,
    };

    const result = await addSuggestion({
      tenantId: "gldf",
      type: "missing",
      title: "Add an upcoming event",
      description: "Events give people a reason to visit.",
      action: "prompt:Help me create an event",
      section: "events",
    });

    expect(result.id).toBe("sug_existing");
    // No insert payload captured because we short-circuited on the duplicate.
    expect(supa.lastInsert).toBeUndefined();
  });

  it("updateSuggestion maps the updated snake_case row back to a Suggestion", async () => {
    supa.result = {
      data: [
        {
          id: "sug_1",
          tenant_id: "gldf",
          type: "stale",
          title: "Freshen up your hero",
          description: "Hero is stale.",
          action: "update_section:hero",
          section: "hero",
          status: "accepted",
          created_at: "2026-06-20T00:00:00.000Z",
        },
      ],
      error: null,
    };

    const updated = await updateSuggestion("gldf", "sug_1", "accepted");

    expect(updated).toEqual({
      id: "sug_1",
      tenantId: "gldf",
      type: "stale",
      title: "Freshen up your hero",
      description: "Hero is stale.",
      action: "update_section:hero",
      section: "hero",
      status: "accepted",
      createdAt: "2026-06-20T00:00:00.000Z",
    });
    expect(supa.lastTable).toBe("suggestions");
  });
});
