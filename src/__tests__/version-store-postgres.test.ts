/**
 * Postgres dual-path coverage for version-store.
 *
 * Exercises the DATA_SOURCE=postgres branch of getVersions / appendVersion:
 *  - the read path maps snake_case `content_versions` rows -> camelCase
 *    ContentVersion (id, section, data, author, timestamp, status, changes)
 *  - the write path hits the `content_versions` table with snake_case columns
 *    (tenant_id, created_at, ...) via versionToInsert
 *
 * Sanity is forced off (`hasSanity: false`) so ONLY the Postgres branch runs.
 * The Supabase client is a chainable + thenable Proxy builder so list queries
 * (`await builder`) and single queries (`.maybeSingle()`/`.single()`) both
 * resolve.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supa = vi.hoisted(() => ({
  result: { data: null as unknown, error: null as unknown },
  lastTable: "",
  lastInsert: undefined as unknown,
}));

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
// module-level const evaluated at import time, so stubbing env vars is not
// enough — we mock the module to pin it false. setContent (used by
// restoreVersion, not under test here) is left untouched by spreading the orig.
vi.mock("@/lib/storage/core", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  hasSanity: false,
}));

import { appendVersion, getVersions } from "@/lib/storage/version-store";

beforeEach(() => {
  vi.stubEnv("DATA_SOURCE", "postgres");
  vi.stubEnv("NEXT_PUBLIC_SANITY_PROJECT_ID", "");
  vi.stubEnv("SANITY_API_TOKEN", "");
  supa.result = { data: null, error: null };
  supa.lastTable = "";
  supa.lastInsert = undefined;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("version-store Postgres dual-path", () => {
  it("getVersions maps snake_case content_versions rows to camelCase", async () => {
    // A realistic row as it comes back from Postgres (snake_case columns).
    supa.result = {
      data: [
        {
          id: "v_1718800000000_abc123",
          tenant_id: "gldf",
          section: "hero",
          data: { title: "Welcome", subtitle: "We fix things" },
          author: "ai",
          created_at: "2026-06-19T12:00:00.000Z",
          status: "live",
          changes: [{ field: "title", before: "Hi", after: "Welcome" }],
        },
      ],
      error: null,
    };

    const versions = await getVersions("hero", "gldf");

    // Read hit the right table.
    expect(supa.lastTable).toBe("content_versions");
    expect(versions).toHaveLength(1);

    const v = versions[0];
    expect(v.id).toBe("v_1718800000000_abc123");
    expect(v.section).toBe("hero");
    expect(v.data).toEqual({ title: "Welcome", subtitle: "We fix things" });
    expect(v.author).toBe("ai");
    // created_at -> timestamp (the camelCase rename the mapper does).
    expect(v.timestamp).toBe("2026-06-19T12:00:00.000Z");
    expect(v.status).toBe("live");
    expect(v.changes).toEqual([{ field: "title", before: "Hi", after: "Welcome" }]);

    // No stray snake_case keys leaked into the mapped object.
    expect(v).not.toHaveProperty("tenant_id");
    expect(v).not.toHaveProperty("created_at");
  });

  it("getVersions null-coalesces missing changes to undefined", async () => {
    supa.result = {
      data: [
        {
          id: "v_1718800000001_def456",
          tenant_id: "rohlax",
          section: "about",
          data: { body: "About us" },
          author: "user",
          created_at: "2026-06-18T00:00:00.000Z",
          status: "rolled-back",
          changes: null,
        },
      ],
      error: null,
    };

    const [v] = await getVersions("hero", "rohlax");

    expect(v.changes).toBeUndefined();
    expect(v.status).toBe("rolled-back");
    expect(v.author).toBe("user");
  });

  it("getVersions surfaces an authoritative Postgres failure", async () => {
    supa.result = { data: null, error: { message: "boom" } };
    await expect(getVersions("hero", "gldf")).rejects.toMatchObject({ message: "boom" });
  });

  it("appendVersion inserts snake_case columns into content_versions", async () => {
    const data = { title: "New headline" };
    const changes = [{ field: "title", before: "Old", after: "New headline" }];

    const version = await appendVersion("hero", data, "admin", "gldf", changes);

    // Write hit the right table.
    expect(supa.lastTable).toBe("content_versions");

    const insert = supa.lastInsert as Record<string, unknown>;
    expect(insert).toBeTruthy();

    // tenant + section columns are snake_case.
    expect(insert.tenant_id).toBe("gldf");
    expect(insert.section).toBe("hero");
    // camelCase store fields written to snake_case columns, values intact.
    expect(insert.data).toEqual(data);
    expect(insert.author).toBe("admin");
    expect(insert.status).toBe("live");
    expect(insert.changes).toEqual(changes);
    // timestamp -> created_at (the snake_case rename versionToInsert does).
    expect(typeof insert.created_at).toBe("string");
    expect(insert.created_at).toBe(version.timestamp);
    // The generated id is persisted (content_versions.id is app-supplied).
    expect(insert.id).toBe(version.id);
    // No stray camelCase keys leaked into the insert payload.
    expect(insert).not.toHaveProperty("timestamp");
    expect(insert).not.toHaveProperty("tenant");

    // The returned ContentVersion carries the generated id + live status.
    // id format is v_<uuid> (crypto.randomUUID(), collision-safe).
    expect(version.id).toMatch(/^v_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(version.status).toBe("live");
    expect(version.section).toBe("hero");
  });

  it("appendVersion null-coalesces a missing changes arg to null on insert", async () => {
    await appendVersion("services", { items: [] }, "user", "rohlax");

    const insert = supa.lastInsert as Record<string, unknown>;
    expect(insert.tenant_id).toBe("rohlax");
    expect(insert.section).toBe("services");
    // versionToInsert coalesces undefined changes -> null for the JSON column.
    expect(insert.changes).toBeNull();
  });
});
