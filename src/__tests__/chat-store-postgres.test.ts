import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Shared mock state for the Supabase client. `result` is what every query
// resolves to (list `await builder` and `.maybeSingle()`/`.single()` alike).
const supa = vi.hoisted(() => ({
  result: { data: null as unknown, error: null as unknown },
  lastTable: "",
  lastInsert: undefined as unknown,
}));

// A chainable + thenable Proxy: every method returns a new builder, `await`ing
// it resolves to `supa.result`, and insert/upsert capture the written payload.
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

// Configured Supabase client -> forces the Postgres branch.
vi.mock("@/lib/db/client", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  getSupabase: () => ({
    from: (t: string) => {
      supa.lastTable = t;
      return builder();
    },
  }),
}));

// Redis must be inert (the store only touches it on the Sanity path, but keep
// it null so nothing real is reached).
vi.mock("@/lib/redis", () => ({ getRedis: () => null }));

// Sanity client must never be invoked on the Postgres-only path; throw if it is.
vi.mock("@/lib/sanity", () => ({
  getSanityClient: () => {
    throw new Error("Sanity must not be touched on the Postgres-only path");
  },
}));

// `hasSanity` is a module-load-time constant from env, so env stubs in
// beforeEach can't flip it. Force it false here so only the Postgres path runs
// (keep the rest of core intact for DEFAULT_TENANT / dev helpers).
vi.mock("@/lib/storage/core", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  hasSanity: false,
}));

import { loadChatMessages, saveChatMessages } from "@/lib/storage/chat-store";

beforeEach(() => {
  // DATA_SOURCE=postgres selects the PG branch; unset Sanity env so `hasSanity`
  // is false and only the Postgres path runs.
  vi.stubEnv("DATA_SOURCE", "postgres");
  vi.stubEnv("NEXT_PUBLIC_SANITY_PROJECT_ID", "");
  vi.stubEnv("SANITY_API_TOKEN", "");
  supa.result = { data: null, error: null };
  supa.lastInsert = undefined;
  supa.lastTable = "";
});

afterEach(() => vi.unstubAllEnvs());

describe("chat-store Postgres dual-path", () => {
  it("loadChatMessages reads the messages blob from chat_sessions", async () => {
    const messages = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ];
    // snake_case row matching the chat_sessions.Row shape (messages = Json blob).
    supa.result = {
      data: { messages },
      error: null,
    };

    const out = await loadChatMessages("client-1", "acme");

    expect(supa.lastTable).toBe("chat_sessions");
    expect(out).toEqual(messages);
  });

  it("loadChatMessages returns [] on a Postgres miss (no Sanity configured)", async () => {
    supa.result = { data: null, error: null };

    const out = await loadChatMessages("client-1", "acme");

    expect(supa.lastTable).toBe("chat_sessions");
    expect(out).toEqual([]);
  });

  it("saveChatMessages upserts the snake_case row into chat_sessions", async () => {
    const messages = [{ role: "user", content: "update my hours" }];

    await saveChatMessages("client-9", messages, "acme");

    expect(supa.lastTable).toBe("chat_sessions");

    const written = supa.lastInsert as Record<string, unknown>;
    expect(written.tenant_id).toBe("acme");
    expect(written.client_id).toBe("client-9");
    expect(written.messages).toEqual(messages);
    expect(typeof written.updated_at).toBe("string");
    // camelCase keys must NOT leak into the DB payload.
    expect(written).not.toHaveProperty("tenantId");
    expect(written).not.toHaveProperty("clientId");
  });

  it("saveChatMessages trims to the last 100 messages before writing", async () => {
    const messages = Array.from({ length: 150 }, (_, i) => ({
      role: "user",
      content: `msg-${i}`,
    }));

    await saveChatMessages("client-9", messages, "acme");

    const written = supa.lastInsert as { messages: unknown[] };
    expect(written.messages).toHaveLength(100);
    expect((written.messages[0] as { content: string }).content).toBe("msg-50");
    expect((written.messages[99] as { content: string }).content).toBe("msg-149");
  });
});
