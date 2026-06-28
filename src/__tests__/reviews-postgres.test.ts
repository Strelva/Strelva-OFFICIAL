import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supa = vi.hoisted(() => ({
  list: [] as unknown[],
  single: null as unknown,
  lastTable: "",
  lastInsert: undefined as unknown,
  lastUpdate: undefined as unknown,
}));

function builder() {
  const listP = Promise.resolve({ data: supa.list, error: null });
  return new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") return listP.then.bind(listP);
        if (prop === "maybeSingle" || prop === "single") {
          return () => Promise.resolve({ data: supa.single, error: null });
        }
        if (prop === "insert") return (v: unknown) => { supa.lastInsert = v; return builder(); };
        if (prop === "upsert") return (v: unknown) => { supa.lastInsert = v; return builder(); };
        if (prop === "update") return (v: unknown) => { supa.lastUpdate = v; return builder(); };
        return () => builder();
      },
    }
  );
}

vi.mock("@/lib/db/client", async (orig) => ({
  ...(await orig() as object),
  getSupabase: () => ({ from: (t: string) => { supa.lastTable = t; return builder(); } }),
}));

import { getReviews, addReview, replyToReview } from "@/lib/reviews";

beforeEach(() => {
  vi.stubEnv("DATA_SOURCE", "postgres");
  vi.stubEnv("NEXT_PUBLIC_SANITY_PROJECT_ID", "");
  vi.stubEnv("SANITY_API_TOKEN", "");
  supa.list = [];
  supa.single = null;
  supa.lastTable = "";
  supa.lastInsert = undefined;
  supa.lastUpdate = undefined;
});
afterEach(() => vi.unstubAllEnvs());

describe("reviews Postgres dual-path", () => {
  it("getReviews maps snake_case rows to ReviewItem (id = row uuid)", async () => {
    supa.list = [
      {
        id: "11111111-1111-1111-1111-111111111111",
        tenant_id: "gldf",
        source: "google",
        author: "Jane",
        rating: 5,
        text: "Great",
        review_date: "2026-06-20T00:00:00.000Z",
        reply: null,
        replied_at: null,
        created_at: "2026-06-20T00:00:00.000Z",
      },
    ];
    const [r] = await getReviews("gldf");
    expect(supa.lastTable).toBe("reviews");
    expect(r).toMatchObject({
      id: "11111111-1111-1111-1111-111111111111",
      source: "google",
      author: "Jane",
      rating: 5,
      text: "Great",
      date: "2026-06-20T00:00:00.000Z",
    });
    expect(r.reply).toBeUndefined();
  });

  it("addReview inserts snake_case columns and returns the DB-assigned id", async () => {
    supa.single = {
      id: "22222222-2222-2222-2222-222222222222",
      tenant_id: "gldf",
      source: "manual",
      author: "Bob",
      rating: 4,
      text: "Nice",
      review_date: "2026-06-21T00:00:00.000Z",
      reply: null,
      replied_at: null,
      created_at: "2026-06-21T00:00:00.000Z",
    };
    const out = await addReview("gldf", {
      source: "manual",
      author: "Bob",
      rating: 4,
      text: "Nice",
      date: "2026-06-21T00:00:00.000Z",
    });
    const insert = supa.lastInsert as Record<string, unknown>;
    expect(insert.tenant_id).toBe("gldf");
    expect(insert.review_date).toBe("2026-06-21T00:00:00.000Z");
    expect(insert).not.toHaveProperty("id"); // DB assigns the uuid
    expect(out.id).toBe("22222222-2222-2222-2222-222222222222");
  });

  it("replyToReview updates reply + replied_at by uuid and returns the row", async () => {
    supa.single = {
      id: "33333333-3333-3333-3333-333333333333",
      tenant_id: "gldf",
      source: "google",
      author: "Ann",
      rating: 5,
      text: "Love it",
      review_date: "2026-06-19T00:00:00.000Z",
      reply: "Thank you!",
      replied_at: "2026-06-21T00:00:00.000Z",
      created_at: "2026-06-19T00:00:00.000Z",
    };
    const out = await replyToReview("gldf", "33333333-3333-3333-3333-333333333333", "Thank you!");
    const update = supa.lastUpdate as Record<string, unknown>;
    expect(update.reply).toBe("Thank you!");
    expect(typeof update.replied_at).toBe("string");
    expect(out?.reply).toBe("Thank you!");
  });
});
