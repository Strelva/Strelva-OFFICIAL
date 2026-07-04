import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetRedis = vi.hoisted(() => vi.fn());

vi.mock("@/lib/redis", () => ({ getRedis: mockGetRedis }));

import {
  getTenantCrm,
  getAllTenantCrm,
  setTenantTags,
  setTenantStage,
  addTenantNote,
} from "@/lib/tenant-crm";

/** Minimal in-memory Redis stand-in covering the get/set/mget this store uses. */
function fakeRedis() {
  const store = new Map<string, unknown>();
  return {
    store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
      return "OK";
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
    expect(crm.notes[0].text).toBe("second note"); // newest first
    expect(crm.notes[1].text).toBe("first note");
    expect(crm.notes[0].id).toBeTruthy();
    expect(crm.notes[0].author).toBe("jacob@strelva.com");
    expect(() => new Date(crm.notes[0].createdAt).toISOString()).not.toThrow();
    expect(crm.notes[0].id).not.toBe(crm.notes[1].id);
  });
});

describe("getAllTenantCrm", () => {
  it("fills defaults for tenants without a record and returns stored ones", async () => {
    mockGetRedis.mockReturnValue(fakeRedis());
    await setTenantStage("live-co", "live");

    const all = await getAllTenantCrm(["live-co", "empty-co"]);
    expect(all["live-co"].stage).toBe("live");
    expect(all["empty-co"]).toEqual({
      tenantId: "empty-co",
      tags: [],
      stage: null,
      notes: [],
      updatedAt: null,
    });
  });

  it("fills defaults for every id when Redis is unconfigured", async () => {
    mockGetRedis.mockReturnValue(null);
    const all = await getAllTenantCrm(["a", "b"]);
    expect(Object.keys(all)).toEqual(["a", "b"]);
    expect(all.a.updatedAt).toBeNull();
  });
});
