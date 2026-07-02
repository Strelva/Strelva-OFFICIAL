import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeRedisMock } from "./support/redis-mock";

const mockRedis = makeRedisMock();
const mockGetTenantConfig = vi.fn();
const mockSendNewLeadEmail = vi.fn();
let clock = Date.UTC(2026, 5, 1);

vi.mock("@/lib/redis", () => ({ getRedis: () => mockRedis }));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: (...a: unknown[]) => mockGetTenantConfig(...a) }));
vi.mock("@/lib/delivery-email", () => ({ sendNewLeadEmail: (...a: unknown[]) => mockSendNewLeadEmail(...a) }));

beforeEach(() => {
  mockRedis.store.clear();
  mockRedis.zsets.clear();
  mockGetTenantConfig.mockReset();
  mockGetTenantConfig.mockResolvedValue({ id: "t1", subdomain: "t1", siteName: "Test Site", ownerEmail: "owner@example.com" });
  mockSendNewLeadEmail.mockReset();
  mockSendNewLeadEmail.mockResolvedValue(true);
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

  it("emails the owner when a genuinely new lead comes in", async () => {
    await recordLead("t1", { name: "Sarah Chen", email: "s@x.com", message: "Saturday?", source: "contact-form" });
    expect(mockSendNewLeadEmail).toHaveBeenCalledTimes(1);
    const arg = mockSendNewLeadEmail.mock.calls[0][0];
    expect(arg.email).toBe("owner@example.com");
    expect(arg.lead.name).toBe("Sarah Chen");
    expect(arg.lead.email).toBe("s@x.com");
    expect(arg.lead.message).toBe("Saturday?");
  });

  it("does not re-email the owner on a duplicate re-submission", async () => {
    await recordLead("t1", { name: "Sarah Chen", email: "s@x.com", message: "Saturday?" });
    await recordLead("t1", { name: "Sarah Chen", email: "s@x.com", message: "Saturday?" });
    expect(mockSendNewLeadEmail).toHaveBeenCalledTimes(1);
  });

  it("captures the lead even when the owner notification throws", async () => {
    mockSendNewLeadEmail.mockRejectedValue(new Error("resend down"));
    const lead = await recordLead("t1", { name: "Sarah", email: "s@x.com", message: "hi" });
    expect(lead).not.toBeNull();
    expect(await getLeads("t1")).toHaveLength(1);
  });

  it("releases the dedup lock when indexing fails, so a retry isn't swallowed", async () => {
    const orig = mockRedis.zadd;
    mockRedis.zadd = async () => {
      throw new Error("redis down mid-write");
    };
    await expect(
      recordLead("t1", { name: "Sarah", email: "s@x.com", message: "hi" }),
    ).rejects.toThrow();

    mockRedis.zadd = orig;
    const retry = await recordLead("t1", { name: "Sarah", email: "s@x.com", message: "hi" });
    expect(retry).not.toBeNull(); // dedup lock was released, retry captured it
    expect(await getLeads("t1")).toHaveLength(1);
  });
});
