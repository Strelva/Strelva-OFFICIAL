/**
 * Postgres dual-path tests for inbox-store.
 *
 * Exercises the DATA_SOURCE=postgres branch with a chainable+thenable Supabase
 * builder mock. Validates the real snake_case<->camelCase mapping and that the
 * Postgres branch is taken (right table + right insert columns), with Sanity off
 * (env unset -> hasSanity false) so only the Postgres path runs.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supa = vi.hoisted(() => ({
  result: { data: null as unknown, error: null as unknown },
  lastTable: "",
  lastInsert: undefined as unknown,
  lastUpdate: undefined as unknown,
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

vi.mock("@/lib/db/client", async (orig) => ({
  ...(await orig()),
  getSupabase: () => ({
    from: (t: string) => {
      supa.lastTable = t;
      return builder();
    },
  }),
}));

import {
  addInboxItem,
  getInboxItems,
  markInboxRead,
  type InboxItem,
} from "@/lib/storage/inbox-store";

beforeEach(() => {
  vi.stubEnv("DATA_SOURCE", "postgres");
  // Sanity off: hasSanity is computed at import from these (already unset in the
  // test env). Stub explicitly so the Postgres branch is the only one taken.
  vi.stubEnv("NEXT_PUBLIC_SANITY_PROJECT_ID", "");
  vi.stubEnv("SANITY_API_TOKEN", "");
  supa.result = { data: null, error: null };
  supa.lastTable = "";
  supa.lastInsert = undefined;
  supa.lastUpdate = undefined;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("inbox-store Postgres dual-path", () => {
  it("getInboxItems maps snake_case inbox_items rows to camelCase InboxItem", async () => {
    // A fake row exactly matching the inbox_items columns (snake_case).
    supa.result = {
      data: [
        {
          id: "inbox_123",
          tenant_id: "gldf",
          type: "review-alert",
          title: "New 5-star review",
          detail: "Jane left a review",
          time: "2026-06-20T12:00:00.000Z",
          read: false,
          section: "reviews",
          actions: [{ label: "Reply", href: "/reviews/1" }],
          created_at: "2026-06-20T12:00:00.000Z",
        },
      ],
      error: null,
    };

    const items = await getInboxItems("gldf");

    expect(supa.lastTable).toBe("inbox_items");
    expect(items).toHaveLength(1);
    // The mapper: time -> timestamp, snake columns -> camel store shape.
    expect(items[0]).toEqual<InboxItem>({
      id: "inbox_123",
      type: "review-alert",
      title: "New 5-star review",
      detail: "Jane left a review",
      timestamp: "2026-06-20T12:00:00.000Z",
      read: false,
      section: "reviews",
      actions: [{ label: "Reply", href: "/reviews/1" }],
    });
  });

  it("getInboxItems coerces nullable columns (detail/section/actions) to undefined", async () => {
    supa.result = {
      data: [
        {
          id: "inbox_456",
          tenant_id: "gldf",
          type: "system",
          title: "Heads up",
          detail: null,
          time: "2026-06-20T13:00:00.000Z",
          read: true,
          section: null,
          actions: null,
          created_at: "2026-06-20T13:00:00.000Z",
        },
      ],
      error: null,
    };

    const items = await getInboxItems("gldf");

    expect(items[0].detail).toBeUndefined();
    expect(items[0].section).toBeUndefined();
    expect(items[0].actions).toBeUndefined();
    expect(items[0].read).toBe(true);
  });

  it("addInboxItem writes camelCase fields to the inbox_items table as snake_case columns", async () => {
    const created = await addInboxItem(
      {
        type: "ai-action",
        title: "Updated hours",
        detail: "Saturday hours added",
        section: "content",
        actions: [{ label: "View", href: "/content" }],
      },
      "gldf"
    );

    // Postgres branch was taken: right table + snake_case insert payload.
    expect(supa.lastTable).toBe("inbox_items");
    expect(supa.lastInsert).toEqual({
      id: created.id,
      tenant_id: "gldf",
      type: "ai-action",
      title: "Updated hours",
      detail: "Saturday hours added",
      time: created.timestamp,
      read: false,
      section: "content",
      actions: [{ label: "View", href: "/content" }],
    });

    // The returned object is the camelCase store shape with generated fields.
    expect(created.read).toBe(false);
    expect(created.id).toMatch(/^inbox_/);
    expect(typeof created.timestamp).toBe("string");
  });

  it("addInboxItem maps absent optional fields to null columns", async () => {
    const created = await addInboxItem(
      { type: "subscriber", title: "New subscriber" },
      "gldf"
    );

    expect(supa.lastInsert).toEqual({
      id: created.id,
      tenant_id: "gldf",
      type: "subscriber",
      title: "New subscriber",
      detail: null,
      time: created.timestamp,
      read: false,
      section: null,
      actions: null,
    });
  });

  it("markInboxRead updates the inbox_items read flag and reports success when a row matches", async () => {
    // Update path returns the affected rows from .select("id").
    supa.result = { data: [{ id: "inbox_123" }], error: null };

    const ok = await markInboxRead("inbox_123", "gldf");

    expect(supa.lastTable).toBe("inbox_items");
    expect(supa.lastUpdate).toEqual({ read: true });
    expect(ok).toBe(true);
  });

  it("markInboxRead reports false when no row matched", async () => {
    supa.result = { data: [], error: null };

    const ok = await markInboxRead("missing", "gldf");

    expect(ok).toBe(false);
  });
});
