import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeRedisMock } from "./support/redis-mock";

const mockRedis = makeRedisMock();
const mocks = vi.hoisted(() => ({ tenant: vi.fn(), capture: vi.fn(), legacy: vi.fn() }));
vi.mock("@/lib/redis", () => ({ getRedis: () => mockRedis }));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: mocks.tenant }));
vi.mock("@/lib/leads", () => ({ captureLead: mocks.capture, recordLead: mocks.legacy }));
vi.mock("@/lib/rate-limit", () => ({ isRateLimitedAsync: async () => false, rateLimitKey: () => "k" }));

import { getSpam, recordSpam } from "@/lib/spam-pit";
import { GET, POST } from "@/app/api/v1/spam-pit/[tenant]/route";
import { POST as LEADS_POST } from "@/app/api/v1/leads/[tenant]/route";

const params = (tenant: string) => ({ params: Promise.resolve({ tenant }) });
const req = (method: string, key: string | null, body?: unknown, url = "https://app.strelva.test/api/v1/spam-pit/cocard-anderson") =>
  new Request(url, {
    method,
    headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

beforeEach(() => {
  mockRedis.store.clear();
  mockRedis.zsets.clear();
  mocks.tenant.mockReset();
  mocks.tenant.mockResolvedValue({ id: "cocard-anderson", active: true });
  mocks.capture.mockReset();
  mocks.legacy.mockReset();
  process.env.SPAM_PIT_WRITE_KEY = "write-key";
  process.env.SPAM_PIT_READ_KEY = "read-key";
});

describe("spam pit store", () => {
  it("keeps records newest-first and per tenant", async () => {
    await recordSpam("a", { reason: "honeypot", name: "Bot One" });
    await new Promise((r) => setTimeout(r, 2));
    await recordSpam("a", { reason: "turnstile", name: "Bot Two", fields: { phone: "1", junk: 5 as unknown as string } });
    await recordSpam("b", { reason: "dwell", name: "Other" });
    const a = await getSpam("a");
    expect(a.map((r) => r.name)).toEqual(["Bot Two", "Bot One"]);
    expect(a[0]!.fields).toEqual({ phone: "1" });
    expect(await getSpam("b")).toHaveLength(1);
  });
});

describe("spam pit API", () => {
  it("fails closed when keys are unset", async () => {
    delete process.env.SPAM_PIT_WRITE_KEY;
    delete process.env.SPAM_PIT_READ_KEY;
    expect((await POST(req("POST", "", { reason: "x" }), params("cocard-anderson"))).status).toBe(401);
    expect((await GET(req("GET", ""), params("cocard-anderson"))).status).toBe(401);
  });

  it("the write key can file but cannot read; the read key can read but cannot file", async () => {
    const w = await POST(req("POST", "write-key", { reason: "canned-message", name: "Samantha Moore", email: "x@gmail.com" }), params("cocard-anderson"));
    expect(w.status).toBe(200);
    expect((await GET(req("GET", "write-key"), params("cocard-anderson"))).status).toBe(401);
    expect((await POST(req("POST", "read-key", { reason: "x" }), params("cocard-anderson"))).status).toBe(401);
    const r = await GET(req("GET", "read-key"), params("cocard-anderson"));
    const body = await r.json();
    expect(body.count).toBe(1);
    expect(body.items[0]).toMatchObject({ reason: "canned-message", name: "Samantha Moore" });
  });

  it("rejects a malformed tenant", async () => {
    expect((await POST(req("POST", "write-key", { reason: "x" }), params("../evil"))).status).toBe(400);
  });
});

describe("v1 leads spam goes to the pit, not the lead store", () => {
  const leads = (body: Record<string, unknown>, tenant = "cocard-anderson") =>
    LEADS_POST(new Request(`https://app.strelva.test/api/v1/leads/${tenant}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }), params(tenant));

  it("honeypot hit: fake success, pit record, no lead", async () => {
    const res = await leads({ name: "Bot", email: "b@x.com", message: "hi", website: "http://spam" });
    expect(res.status).toBe(200);
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(mocks.legacy).not.toHaveBeenCalled();
    const pit = await getSpam("cocard-anderson");
    expect(pit).toHaveLength(1);
    expect(pit[0]!.reason).toBe("honeypot");
  });

  it("unknown tenant: still fake success, but nothing is written", async () => {
    mocks.tenant.mockResolvedValue(null);
    const res = await leads({ name: "Bot", email: "b@x.com", website: "http://spam" }, "no-such-tenant");
    expect(res.status).toBe(200);
    expect(await getSpam("no-such-tenant")).toHaveLength(0);
  });
});
