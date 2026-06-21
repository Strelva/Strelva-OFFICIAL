/**
 * Postgres dual-path coverage for page-config-store.
 *
 * Exercises the DATA_SOURCE=postgres branch end to end against a mocked Supabase
 * client. The point is real validation of the per-page-row <-> blob mapping
 * (snake_case columns <-> camelCase `SitePageConfig`) and that the Postgres
 * branch is actually taken — not coverage padding.
 *
 * Sanity is disabled (env unset -> `hasSanity` false) and Redis is null so only
 * the Postgres path runs.
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
// the written rows, and every other method returns a fresh builder so
// `.from(t).select("*").eq(...)` and `.from(t).delete().eq(...)` both work.
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

// Redis off so the read path skips the cache and the write path's cache
// populate is a no-op — only the Postgres branch is observed.
vi.mock("@/lib/redis", () => ({ getRedis: () => null }));

import {
  getPageConfig,
  getDraftPageConfig,
  setPageConfig,
  setDraftPageConfig,
} from "@/lib/storage/page-config-store";
import type { SitePageConfig } from "@/lib/types";

beforeEach(() => {
  vi.stubEnv("DATA_SOURCE", "postgres");
  vi.stubEnv("NEXT_PUBLIC_SANITY_PROJECT_ID", "");
  vi.stubEnv("SANITY_API_TOKEN", "");
  supa.result = { data: null, error: null };
  supa.lastTable = "";
  supa.lastInsert = undefined;
});

afterEach(() => vi.unstubAllEnvs());

describe("page-config-store postgres path", () => {
  it("getPageConfig maps snake_case page_config rows into a camelCase blob", async () => {
    // Two per-page rows as the DB returns them (snake_case columns).
    supa.result = {
      data: [
        {
          tenant_id: "gldf",
          page_name: "home",
          sections: [{ type: "hero", visible: true, order: 0 }],
          seo: { title: "Home", description: "Welcome" },
          version: 3,
          updated_at: "2026-06-20T00:00:00.000Z",
        },
        {
          tenant_id: "gldf",
          page_name: "about",
          sections: [{ type: "story", visible: true, order: 0 }],
          seo: null,
          version: 1,
          updated_at: "2026-06-20T00:00:00.000Z",
        },
      ],
      error: null,
    };

    const config = await getPageConfig("gldf");

    expect(config).toEqual({
      home: {
        sections: [{ type: "hero", visible: true, order: 0 }],
        seo: { title: "Home", description: "Welcome" },
      },
      about: {
        sections: [{ type: "story", visible: true, order: 0 }],
        seo: undefined,
      },
    });
    // Confirms the Postgres branch was the source of this read.
    expect(supa.lastTable).toBe("page_config");
  });

  it("getDraftPageConfig reads the draft_page_config table", async () => {
    supa.result = {
      data: [
        {
          tenant_id: "gldf",
          page_name: "home",
          sections: [{ type: "hero", visible: false, order: 2 }],
          seo: { title: "Draft" },
          updated_at: "2026-06-20T00:00:00.000Z",
        },
      ],
      error: null,
    };

    const draft = await getDraftPageConfig("gldf");

    expect(draft).toEqual({
      home: {
        sections: [{ type: "hero", visible: false, order: 2 }],
        seo: { title: "Draft" },
      },
    });
    expect(supa.lastTable).toBe("draft_page_config");
  });

  it("setPageConfig writes per-page rows to page_config with snake_case columns", async () => {
    const config: SitePageConfig = {
      home: {
        sections: [{ type: "hero", visible: true, order: 0 }],
        seo: { title: "Home" },
      },
      services: {
        sections: [{ type: "services", visible: true, order: 1 }],
      },
    };

    await setPageConfig(config, "gldf");

    expect(supa.lastTable).toBe("page_config");
    expect(supa.lastInsert).toEqual([
      {
        tenant_id: "gldf",
        page_name: "home",
        sections: [{ type: "hero", visible: true, order: 0 }],
        seo: { title: "Home" },
      },
      {
        tenant_id: "gldf",
        page_name: "services",
        sections: [{ type: "services", visible: true, order: 1 }],
        seo: null,
      },
    ]);
  });

  it("setDraftPageConfig writes per-page rows to draft_page_config", async () => {
    const config: SitePageConfig = {
      home: {
        sections: [{ type: "hero", visible: true, order: 0 }],
        seo: { title: "Draft home" },
      },
    };

    await setDraftPageConfig(config, "gldf");

    expect(supa.lastTable).toBe("draft_page_config");
    expect(supa.lastInsert).toEqual([
      {
        tenant_id: "gldf",
        page_name: "home",
        sections: [{ type: "hero", visible: true, order: 0 }],
        seo: { title: "Draft home" },
      },
    ]);
  });
});
