/**
 * Postgres dual-path coverage for site-snapshot-store.
 *
 * Exercises the DATA_SOURCE=postgres branch against a mocked Supabase client.
 * The point is real validation of the `site_snapshots` row <-> SiteSnapshot
 * mapping (snake_case columns <-> camelCase) and that the Postgres branch is
 * actually taken — not coverage padding.
 *
 * Sanity is disabled (env unset -> `hasSanity` false) so only the Postgres path
 * runs. The store touches no Redis; `content-store` is mocked so a snapshot's
 * captured section data is deterministic instead of hitting real storage.
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
// the written row, and every other method returns a fresh builder so
// `.from(t).select("*").eq(...).limit(1).maybeSingle()` and
// `.from(t).insert(row)` both work.
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

// Make captured section data deterministic and keep the store off real storage.
// `createSiteSnapshot` reads every section via `getContent`; `restoreSiteSnapshot`
// writes via `setContent`. Hoisted so the mock factory can reference them.
const contentMocks = vi.hoisted(() => ({
  getContent: vi.fn(async () => ({ marker: true })),
  setContent: vi.fn(async () => undefined),
}));
vi.mock("@/lib/storage/content-store", () => ({
  getContent: contentMocks.getContent,
  setContent: contentMocks.setContent,
}));
const { getContent, setContent } = contentMocks;

import {
  createSiteSnapshot,
  getSiteSnapshots,
} from "@/lib/storage/site-snapshot-store";

beforeEach(() => {
  vi.stubEnv("DATA_SOURCE", "postgres");
  vi.stubEnv("NEXT_PUBLIC_SANITY_PROJECT_ID", "");
  vi.stubEnv("SANITY_API_TOKEN", "");
  supa.result = { data: null, error: null };
  supa.lastTable = "";
  supa.lastInsert = undefined;
  getContent.mockClear();
  setContent.mockClear();
});

afterEach(() => vi.unstubAllEnvs());

describe("site-snapshot-store postgres path", () => {
  it("getSiteSnapshots maps snake_case site_snapshots rows into camelCase summaries", async () => {
    // Rows as the DB returns them (snake_case columns).
    supa.result = {
      data: [
        {
          id: "snap_1",
          tenant_id: "gldf",
          label: "Daily backup 2026-06-20",
          reason: "daily",
          author: "system",
          created_at: "2026-06-20T00:00:00.000Z",
          sections: ["hero", "services"],
          status: "available",
          restored_at: null,
        },
        {
          id: "snap_2",
          tenant_id: "gldf",
          label: "Before restore 2026-06-19",
          reason: "pre_restore",
          author: "user",
          created_at: "2026-06-19T00:00:00.000Z",
          sections: ["hero"],
          status: "restored",
          restored_at: "2026-06-19T01:00:00.000Z",
        },
      ],
      error: null,
    };

    const summaries = await getSiteSnapshots("gldf");

    expect(summaries).toEqual([
      {
        id: "snap_1",
        tenantId: "gldf",
        label: "Daily backup 2026-06-20",
        reason: "daily",
        author: "system",
        createdAt: "2026-06-20T00:00:00.000Z",
        sections: ["hero", "services"],
        status: "available",
        restoredAt: undefined,
      },
      {
        id: "snap_2",
        tenantId: "gldf",
        label: "Before restore 2026-06-19",
        reason: "pre_restore",
        author: "user",
        createdAt: "2026-06-19T00:00:00.000Z",
        sections: ["hero"],
        status: "restored",
        restoredAt: "2026-06-19T01:00:00.000Z",
      },
    ]);
    // Confirms the Postgres branch was the source of this read.
    expect(supa.lastTable).toBe("site_snapshots");
  });

  it("createSiteSnapshot inserts a snake_case row into site_snapshots", async () => {
    const actor = {
      // A real uuid passes the UUID gate -> actor_user_id is kept.
      userId: "11111111-2222-3333-4444-555555555555",
      email: "owner@example.com",
      type: "user" as const,
      isSuperAdmin: false,
    };

    const snapshot = await createSiteSnapshot("gldf", {
      reason: "manual",
      label: "My backup",
      author: "user",
      actor,
    });

    // Captured the live site content via the (mocked) content-store.
    expect(getContent).toHaveBeenCalled();

    expect(supa.lastTable).toBe("site_snapshots");

    const insert = supa.lastInsert as Record<string, unknown>;
    expect(insert).toMatchObject({
      id: snapshot.id,
      tenant_id: "gldf",
      label: "My backup",
      reason: "manual",
      author: "user",
      created_at: snapshot.createdAt,
      sections: snapshot.sections,
      status: "available",
      restored_at: null,
      actor_user_id: "11111111-2222-3333-4444-555555555555",
      actor_email: "owner@example.com",
      actor_type: "user",
      actor_is_super_admin: false,
    });
    // Every snapshotted section is present in the captured data blob.
    expect(insert.data).toMatchObject({ hero: { marker: true } });
  });

  it("createSiteSnapshot nulls a non-uuid actor_user_id (Clerk-era id is not a uuid)", async () => {
    await createSiteSnapshot("gldf", {
      reason: "manual",
      actor: {
        userId: "user_clerk_abc123",
        email: "legacy@example.com",
        type: "user",
        isSuperAdmin: true,
      },
    });

    const insert = supa.lastInsert as Record<string, unknown>;
    expect(insert.actor_user_id).toBeNull();
    expect(insert.actor_email).toBe("legacy@example.com");
    expect(insert.actor_is_super_admin).toBe(true);
  });
});
