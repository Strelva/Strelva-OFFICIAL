import { describe, it, expect, beforeEach, vi } from "vitest";

const store = new Map<string, unknown>();
const zsets = new Map<string, Map<string, number>>();
let clock = Date.UTC(2026, 5, 1);

const mockRedis = {
  set: async (k: string, v: unknown, opts?: { nx?: boolean }) => {
    if (opts?.nx && store.has(k)) return null;
    store.set(k, v);
    return "OK";
  },
  get: async (k: string) => store.get(k) ?? null,
  mget: async (...keys: string[]) => keys.map((k) => store.get(k) ?? null),
  zadd: async (k: string, { score, member }: { score: number; member: string }) => {
    const z = zsets.get(k) ?? new Map<string, number>();
    z.set(member, score);
    zsets.set(k, z);
    return 1;
  },
  zrange: async (k: string, start: number, stop: number, opts?: { rev?: boolean }) => {
    const z = zsets.get(k) ?? new Map<string, number>();
    let arr = [...z.entries()].sort((a, b) => a[1] - b[1]).map(([m]) => m);
    if (opts?.rev) arr = arr.reverse();
    return arr.slice(start, stop + 1);
  },
  zremrangebyrank: async () => 0,
};

vi.mock("@/lib/redis", () => ({ getRedis: () => mockRedis }));

beforeEach(() => {
  store.clear();
  zsets.clear();
  clock = Date.UTC(2026, 5, 1);
  vi.spyOn(Date, "now").mockImplementation(() => clock);
  vi.useFakeTimers();
  vi.setSystemTime(clock);
});

import { recordLead, getLeads, getLeadSummary } from "@/lib/leads";

describe("leads store", () => {
  it("captures a submission with name + message", async () => {
    await recordLead("t1", { name: "Sarah Chen", email: "s@x.com", message: "Saturday?", source: "contact-form" });
    const leads = await getLeads("t1");
    expect(leads).toHaveLength(1);
    expect(leads[0].name).toBe("Sarah Chen");
    expect(leads[0].message).toBe("Saturday?");
  });

  it("dedupes a double-submit of the same submission", async () => {
    await recordLead("t1", { name: "Sarah Chen", email: "s@x.com", message: "Saturday?" });
    const second = await recordLead("t1", { name: "Sarah Chen", email: "s@x.com", message: "Saturday?" });
    expect(second).toBeNull();
    expect(await getLeads("t1")).toHaveLength(1);
  });

  it("treats a different message as a new lead", async () => {
    await recordLead("t1", { name: "Sarah", email: "s@x.com", message: "Saturday?" });
    await recordLead("t1", { name: "Sarah", email: "s@x.com", message: "Actually Sunday?" });
    expect(await getLeads("t1")).toHaveLength(2);
  });

  it("summarizes count + most-recent for the Today feed", async () => {
    await recordLead("t1", { name: "A", message: "1" });
    clock += 1000;
    vi.setSystemTime(clock);
    await recordLead("t1", { name: "B", message: "2" });
    const s = await getLeadSummary("t1", 30);
    expect(s.count).toBe(2);
    expect(s.recent[0].name).toBe("B"); // newest first
  });
});
