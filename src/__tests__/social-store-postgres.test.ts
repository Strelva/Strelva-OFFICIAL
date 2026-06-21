/**
 * Postgres dual-path tests for the social-post store.
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

import { getSocialPosts, setSocialPosts } from "@/lib/storage/social-store";
import type { SocialPost } from "@/lib/types";

beforeEach(() => {
  vi.stubEnv("DATA_SOURCE", "postgres");
  vi.stubEnv("NEXT_PUBLIC_SANITY_PROJECT_ID", "");
  vi.stubEnv("SANITY_API_TOKEN", "");
  supa.result = { data: null, error: null };
  supa.lastInsert = undefined;
  supa.lastTable = "";
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("social-store Postgres dual-path", () => {
  it("getSocialPosts maps snake_case rows to the camelCase shape", async () => {
    // Fake list-query result: snake_case rows matching the real columns.
    supa.result = {
      data: [
        {
          id: "social_1",
          tenant_id: "gldf",
          platform: "instagram",
          content: "Open Saturday!",
          image_url: "https://blob/img.png",
          status: "published",
          scheduled_for: "2026-06-21T00:00:00.000Z",
          published_at: "2026-06-21T01:00:00.000Z",
          created_at: "2026-06-20T00:00:00.000Z",
        },
        {
          id: "social_2",
          tenant_id: "gldf",
          platform: "facebook",
          content: "Draft copy",
          image_url: null,
          status: "draft",
          scheduled_for: null,
          published_at: null,
          created_at: "2026-06-19T00:00:00.000Z",
        },
      ],
      error: null,
    };

    const result = await getSocialPosts("gldf");

    // Read went to the right table via the Postgres branch.
    expect(supa.lastTable).toBe("social_posts");

    // Mapper produced the camelCase shape; nullable columns -> undefined.
    expect(result).toEqual([
      {
        id: "social_1",
        platform: "instagram",
        content: "Open Saturday!",
        imageUrl: "https://blob/img.png",
        status: "published",
        scheduledFor: "2026-06-21T00:00:00.000Z",
        publishedAt: "2026-06-21T01:00:00.000Z",
        createdAt: "2026-06-20T00:00:00.000Z",
      },
      {
        id: "social_2",
        platform: "facebook",
        content: "Draft copy",
        imageUrl: undefined,
        status: "draft",
        scheduledFor: undefined,
        publishedAt: undefined,
        createdAt: "2026-06-19T00:00:00.000Z",
      },
    ]);
  });

  it("setSocialPosts inserts snake_case rows into social_posts", async () => {
    const posts: SocialPost[] = [
      {
        id: "social_a",
        platform: "instagram",
        content: "Hello world",
        imageUrl: "https://blob/a.png",
        status: "scheduled",
        scheduledFor: "2026-06-25T12:00:00.000Z",
        createdAt: "2026-06-20T00:00:00.000Z",
      },
      {
        // No id / imageUrl / scheduledFor -> exercises id-gen + null mapping.
        platform: "facebook",
        content: "Second post",
        status: "draft",
        createdAt: "2026-06-20T01:00:00.000Z",
      } as SocialPost,
    ];

    await setSocialPosts("gldf", posts);

    // Write hit the right table on the Postgres branch.
    expect(supa.lastTable).toBe("social_posts");

    // The bulk replace inserts an array of snake_case rows.
    const rows = supa.lastInsert as Array<Record<string, unknown>>;
    expect(Array.isArray(rows)).toBe(true);
    expect(rows).toHaveLength(2);

    const [first, second] = rows;

    expect(first.id).toBe("social_a");
    expect(first.tenant_id).toBe("gldf");
    expect(first.platform).toBe("instagram");
    expect(first.content).toBe("Hello world");
    expect(first.image_url).toBe("https://blob/a.png");
    expect(first.status).toBe("scheduled");
    expect(first.scheduled_for).toBe("2026-06-25T12:00:00.000Z");
    expect(first.published_at).toBe(null);
    expect(first.created_at).toBe("2026-06-20T00:00:00.000Z");

    // Missing optional fields map to null; id is generated.
    expect(typeof second.id).toBe("string");
    expect(second.id as string).toMatch(/^social_/);
    expect(second.tenant_id).toBe("gldf");
    expect(second.platform).toBe("facebook");
    expect(second.image_url).toBe(null);
    expect(second.scheduled_for).toBe(null);
    expect(second.published_at).toBe(null);
  });
});
