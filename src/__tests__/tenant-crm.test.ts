import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetRedis = vi.hoisted(() => vi.fn());

vi.mock("@/lib/redis", () => ({ getRedis: mockGetRedis }));

import {
  getTenantCrm,
  getAllTenantCrm,
  setTenantTags,
  setTenantStage,
  addTenantNote,
  addTenantContact,
  removeTenantContact,
  addTenantActivity,
} from "@/lib/tenant-crm";

/**
 * Minimal in-memory Redis stand-in covering get/set/mget/del this store uses,
 * with real `nx` semantics so the per-tenant CRM lock can be exercised.
 */
function fakeRedis() {
  const store = new Map<string, unknown>();
  return {
    store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown, opts?: { nx?: boolean; ex?: number }) => {
      if (opts?.nx && store.has(key)) return null;
      store.set(key, value);
      return "OK";
    }),
    del: vi.fn(async (key: string) => {
      const had = store.delete(key);
      return had ? 1 : 0;
    }),
    mget: vi.fn(async (...keys: string[]) => keys.map((k) => store.get(k) ?? null)),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getTenantCrm", () => {
  it("returns the default record when nothing is stored", async () => {
    mockGetRedis.mockReturnValue(fakeRedis());
    expect(await getTenantCrm("acme")).toEqual({
      tenantId: "acme",
      tags: [],
      stage: null,
      notes: [],
      contacts: [],
      activity: [],
      updatedAt: null,
    });
  });

  it("returns the default record when Redis is unconfigured", async () => {
    mockGetRedis.mockReturnValue(null);
    expect(await getTenantCrm("acme")).toEqual({
      tenantId: "acme",
      tags: [],
      stage: null,
      notes: [],
      contacts: [],
      activity: [],
      updatedAt: null,
    });
  });
});

describe("setTenantTags", () => {
  it("trims, drops empties, dedupes case-insensitively, and caps at 20", async () => {
    mockGetRedis.mockReturnValue(fakeRedis());
    const many = Array.from({ length: 30 }, (_, i) => `tag${i}`);
    const crm = await setTenantTags("acme", [
      "  VIP  ",
      "vip", // dupe of VIP (case-insensitive) -> dropped
      "",
      "   ", // empty after trim -> dropped
      ...many,
    ]);
    expect(crm.tags[0]).toBe("VIP");
    expect(crm.tags).not.toContain("");
    expect(crm.tags.length).toBe(20);
    expect(crm.updatedAt).not.toBeNull();
  });

  it("persists so a subsequent read sees the tags", async () => {
    mockGetRedis.mockReturnValue(fakeRedis());
    await setTenantTags("acme", ["priority"]);
    expect((await getTenantCrm("acme")).tags).toEqual(["priority"]);
  });
});

describe("setTenantStage", () => {
  it("stores the stage", async () => {
    mockGetRedis.mockReturnValue(fakeRedis());
    const crm = await setTenantStage("acme", "building");
    expect(crm.stage).toBe("building");
  });
});

describe("addTenantNote", () => {
  it("prepends the note with an id and createdAt, trimming the text", async () => {
    mockGetRedis.mockReturnValue(fakeRedis());
    await addTenantNote("acme", "first note", "jacob@strelva.com");
    const crm = await addTenantNote("acme", "  second note  ", "jacob@strelva.com");

    expect(crm.notes).toHaveLength(2);
    const note0 = crm.notes[0]!;
    const note1 = crm.notes[1]!;
    expect(note0.text).toBe("second note"); // newest first
    expect(note1.text).toBe("first note");
    expect(note0.id).toBeTruthy();
    expect(note0.author).toBe("jacob@strelva.com");
    expect(() => new Date(note0.createdAt).toISOString()).not.toThrow();
    expect(note0.id).not.toBe(note1.id);
  });
});

describe("addTenantContact / removeTenantContact", () => {
  it("appends contacts with ids, sanitizes fields, and removes by id", async () => {
    mockGetRedis.mockReturnValue(fakeRedis());
    await addTenantContact("acme", {
      name: "  Dana Owner  ",
      email: "dana@acme.com",
      role: "Owner",
    });
    let crm = await addTenantContact("acme", { name: "Sam Ops" });

    expect(crm.contacts).toHaveLength(2);
    const contact0 = crm.contacts[0]!;
    const contact1 = crm.contacts[1]!;
    expect(contact0.name).toBe("Dana Owner"); // trimmed
    expect(contact0.email).toBe("dana@acme.com");
    expect(contact0.id).toBeTruthy();
    expect(contact1.id).not.toBe(contact0.id);
    // optional fields absent when not provided
    expect(contact1.email).toBeUndefined();

    crm = await removeTenantContact("acme", contact0.id);
    expect(crm.contacts).toHaveLength(1);
    expect(crm.contacts[0]!.name).toBe("Sam Ops");
  });

  it("caps contacts at 20", async () => {
    mockGetRedis.mockReturnValue(fakeRedis());
    let crm = await getTenantCrm("acme");
    for (let i = 0; i < 25; i++) {
      crm = await addTenantContact("acme", { name: `Contact ${i}` });
    }
    expect(crm.contacts).toHaveLength(20);
  });
});

describe("addTenantActivity", () => {
  it("prepends newest-first with kind, author, and timestamp", async () => {
    mockGetRedis.mockReturnValue(fakeRedis());
    await addTenantActivity("acme", {
      kind: "call",
      summary: "Kickoff call",
      author: "jacob@strelva.com",
    });
    const crm = await addTenantActivity("acme", {
      kind: "email",
      summary: "  Sent proposal  ",
      author: "jacob@strelva.com",
    });

    expect(crm.activity).toHaveLength(2);
    const act0 = crm.activity[0]!;
    const act1 = crm.activity[1]!;
    expect(act0.kind).toBe("email"); // newest first
    expect(act0.summary).toBe("Sent proposal"); // trimmed
    expect(act1.summary).toBe("Kickoff call");
    expect(act0.author).toBe("jacob@strelva.com");
    expect(() => new Date(act0.at).toISOString()).not.toThrow();
  });

  it("caps activity at 200", async () => {
    mockGetRedis.mockReturnValue(fakeRedis());
    let crm = await getTenantCrm("acme");
    for (let i = 0; i < 205; i++) {
      crm = await addTenantActivity("acme", {
        kind: "note",
        summary: `touch ${i}`,
        author: "op",
      });
    }
    expect(crm.activity).toHaveLength(200);
    expect(crm.activity[0]!.summary).toBe("touch 204"); // newest kept
  });
});

describe("backward compatibility", () => {
  it("normalizes a legacy record (no contacts/activity) to empty arrays", async () => {
    const redis = fakeRedis();
    mockGetRedis.mockReturnValue(redis);
    // A record shaped like the pre-contacts/activity model.
    redis.store.set("crm:legacy", {
      tenantId: "legacy",
      tags: ["vip"],
      stage: "live",
      notes: [{ id: "n1", text: "old note", author: "op", createdAt: "2026-01-01T00:00:00.000Z" }],
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const crm = await getTenantCrm("legacy");
    expect(crm.contacts).toEqual([]);
    expect(crm.activity).toEqual([]);
    expect(crm.tags).toEqual(["vip"]);
    expect(crm.notes).toHaveLength(1);
  });

  it("preserves contacts/activity when adding to a legacy record", async () => {
    const redis = fakeRedis();
    mockGetRedis.mockReturnValue(redis);
    redis.store.set("crm:legacy", { tenantId: "legacy", tags: [], stage: null, notes: [], updatedAt: null });
    const crm = await addTenantContact("legacy", { name: "New Contact" });
    expect(crm.contacts).toHaveLength(1);
    expect(crm.activity).toEqual([]);
  });
});

describe("concurrent mutators", () => {
  it("does not drop a write when two mutators race (lock serializes read-modify-write)", async () => {
    mockGetRedis.mockReturnValue(fakeRedis());

    // A cron auto-log (addTenantActivity) racing an operator's tag edit. Both read
    // the same initial empty record; without the lock the second persist would
    // last-write-wins away the first's field. The lock must preserve BOTH.
    await Promise.all([
      setTenantTags("acme", ["vip"]),
      addTenantActivity("acme", {
        kind: "email",
        summary: "Auto-logged email send",
        author: "cron",
      }),
    ]);

    const crm = await getTenantCrm("acme");
    expect(crm.tags).toEqual(["vip"]);
    expect(crm.activity).toHaveLength(1);
    expect(crm.activity[0]!.summary).toBe("Auto-logged email send");
  });

  it("still writes when Redis is unconfigured (no lock, runs directly)", async () => {
    // Degrade-to-default path: getRedis() null means no lock AND no persistence,
    // so the mutator returns the computed record without throwing.
    mockGetRedis.mockReturnValue(null);
    const crm = await setTenantTags("acme", ["priority"]);
    expect(crm.tags).toEqual(["priority"]);
  });
});

describe("getAllTenantCrm", () => {
  it("fills defaults for tenants without a record and returns stored ones", async () => {
    mockGetRedis.mockReturnValue(fakeRedis());
    await setTenantStage("live-co", "live");

    const all = await getAllTenantCrm(["live-co", "empty-co"]);
    expect(all["live-co"]!.stage).toBe("live");
    expect(all["empty-co"]).toEqual({
      tenantId: "empty-co",
      tags: [],
      stage: null,
      notes: [],
      contacts: [],
      activity: [],
      updatedAt: null,
    });
  });

  it("fills defaults for every id when Redis is unconfigured", async () => {
    mockGetRedis.mockReturnValue(null);
    const all = await getAllTenantCrm(["a", "b"]);
    expect(Object.keys(all)).toEqual(["a", "b"]);
    expect(all.a!.updatedAt).toBeNull();
  });
});
