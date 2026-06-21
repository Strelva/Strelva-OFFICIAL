/**
 * Postgres dual-path tests for the newsletter store.
 *
 * Exercises the DATA_SOURCE=postgres branch end-to-end against a mocked,
 * chainable/thenable Supabase builder. The point is real validation of the
 * snake_case<->camelCase mapping and that the Postgres branch is actually
 * taken (right table + right columns), NOT coverage padding.
 *
 * `hasSanity` in storage/core.ts is a module-load-time const, so we mock the
 * core module to force it false — that pins us to the Postgres-only path with
 * no Sanity dual-write interference. We also mock ../sanity so any accidental
 * Sanity call would blow up loudly rather than hit the network.
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
        if (prop === "maybeSingle" || prop === "single")
          return () => Promise.resolve(supa.result);
        if (prop === "insert" || prop === "upsert")
          return (v: unknown, opts: unknown) => {
            supa.lastInsert = v;
            supa.lastUpsertOpts = opts;
            return builder();
          };
        return () => builder();
      },
    }
  );
}

vi.mock("@/lib/db/client", async (orig) => ({
  ...(await orig<typeof import("@/lib/db/client")>()),
  getSupabase: () => ({
    from: (t: string) => {
      supa.lastTable = t;
      return builder();
    },
  }),
}));

// Force the Sanity dual-write path off so only Postgres runs.
vi.mock("@/lib/storage/core", async (orig) => ({
  ...(await orig<typeof import("@/lib/storage/core")>()),
  hasSanity: false,
}));

// Any Sanity call would be a bug on the Postgres-only path; make it explode.
vi.mock("@/lib/sanity", () => ({
  getSanityClient: () => {
    throw new Error("Sanity must not be called on the Postgres-only path");
  },
  getSanityReadClient: () => {
    throw new Error("Sanity must not be called on the Postgres-only path");
  },
}));

import { addSubscriber, getSubscribers } from "@/lib/storage/newsletter-store";

beforeEach(() => {
  vi.stubEnv("DATA_SOURCE", "postgres");
  vi.stubEnv("NEXT_PUBLIC_SANITY_PROJECT_ID", "");
  vi.stubEnv("SANITY_API_TOKEN", "");
  supa.result = { data: null, error: null };
  supa.lastInsert = undefined;
  supa.lastUpsertOpts = undefined;
  supa.lastTable = "";
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("newsletter-store Postgres dual-path", () => {
  it("getSubscribers maps snake_case rows to the camelCase shape", async () => {
    // Fake list-query result: snake_case rows matching the real columns.
    supa.result = {
      data: [
        {
          email: "a@example.com",
          name: "Alice",
          subscribed_at: "2026-06-20T00:00:00.000Z",
          status: "active",
        },
        {
          email: "b@example.com",
          name: null,
          subscribed_at: "2026-06-19T00:00:00.000Z",
          status: "active",
        },
      ],
      error: null,
    };

    const result = await getSubscribers("gldf");

    // Read went to the right table via the Postgres branch.
    expect(supa.lastTable).toBe("newsletter_subscribers");

    // Mapper produced the camelCase shape; null name -> undefined.
    expect(result).toEqual([
      {
        email: "a@example.com",
        name: "Alice",
        subscribedAt: "2026-06-20T00:00:00.000Z",
        status: "active",
      },
      {
        email: "b@example.com",
        name: undefined,
        subscribedAt: "2026-06-19T00:00:00.000Z",
        status: "active",
      },
    ]);
  });

  it("addSubscriber (new) upserts snake_case columns to newsletter_subscribers", async () => {
    // pgGetSubscriber lookup returns no existing row (maybeSingle -> null).
    supa.result = { data: null, error: null };

    const res = await addSubscriber("new@example.com", "New Person", "gldf");

    // No existing subscriber -> not a duplicate.
    expect(res).toEqual({ duplicate: false });

    // Write hit the right table on the Postgres branch.
    expect(supa.lastTable).toBe("newsletter_subscribers");

    // Insert payload is snake_case with the expected columns.
    const insert = supa.lastInsert as Record<string, unknown>;
    expect(insert.tenant_id).toBe("gldf");
    expect(insert.email).toBe("new@example.com");
    expect(insert.name).toBe("New Person");
    expect(insert.status).toBe("active");
    expect(typeof insert.subscribed_at).toBe("string");
    expect(Number.isNaN(Date.parse(insert.subscribed_at as string))).toBe(false);

    // Upsert conflict target is the (tenant_id, email) pair.
    expect(supa.lastUpsertOpts).toEqual({ onConflict: "tenant_id,email" });
  });

  it("addSubscriber (existing) reports a duplicate and re-activates", async () => {
    // pgGetSubscriber lookup returns an existing (previously unsubscribed) row.
    supa.result = {
      data: {
        email: "existing@example.com",
        name: "Existing",
        subscribed_at: "2026-01-01T00:00:00.000Z",
        status: "unsubscribed",
      },
      error: null,
    };

    const res = await addSubscriber("existing@example.com", undefined, "gldf");

    expect(res).toEqual({ duplicate: true });

    // Re-activation preserves the original subscribed_at and flips status active.
    const insert = supa.lastInsert as Record<string, unknown>;
    expect(insert.email).toBe("existing@example.com");
    expect(insert.subscribed_at).toBe("2026-01-01T00:00:00.000Z");
    expect(insert.status).toBe("active");
  });
});
