import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSendEmail = vi.hoisted(() => vi.fn());
const kv = vi.hoisted(() => new Map<string, unknown>());
const zset = vi.hoisted(() => [] as Array<{ score: number; member: string }>);
const redisPresent = vi.hoisted(() => ({ value: true }));

vi.mock("@/lib/rate-limit", () => ({
  isRateLimitedWindowedAsync: vi.fn(() => Promise.resolve(false)),
  rateLimitKey: vi.fn(() => "access-request-intake:test"),
}));

vi.mock("@/lib/redis", () => ({
  getRedis: vi.fn(() =>
    redisPresent.value
      ? {
          get: vi.fn((key: string) => Promise.resolve(kv.get(key) ?? null)),
          set: vi.fn((key: string, value: unknown) => {
            kv.set(key, value);
            return Promise.resolve("OK");
          }),
          zadd: vi.fn((_key: string, entry: { score: number; member: string }) => {
            zset.push(entry);
            return Promise.resolve(1);
          }),
          zrange: vi.fn(
            (_key: string, start: number, stop: number, opts?: { rev?: boolean }) => {
              const sorted = [...zset].sort((a, b) =>
                opts?.rev ? b.score - a.score : a.score - b.score,
              );
              const end = stop < 0 ? sorted.length : stop + 1;
              return Promise.resolve(sorted.slice(start, end).map((e) => e.member));
            },
          ),
        }
      : null,
  ),
}));

vi.mock("resend", () => ({
  Resend: vi.fn(function Resend() {
    return { emails: { send: mockSendEmail } };
  }),
}));

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  kv.clear();
  zset.length = 0;
  redisPresent.value = true;
  process.env = {
    ...originalEnv,
    NEXT_PUBLIC_SANITY_PROJECT_ID: "",
    SANITY_API_TOKEN: "",
    NEXT_PUBLIC_SITE_URL: "https://strelva.com",
    RESEND_API_KEY: "re_test",
    RESEND_DOMAIN: "updates.strelva.com",
    LEAD_NOTIFY_EMAILS: "",
  };
  mockSendEmail.mockResolvedValue({ data: { id: "email_123" }, error: null, headers: null });
});

describe("resolveLeadNotifyRecipients", () => {
  it("defaults to jacob@strelva.com when LEAD_NOTIFY_EMAILS is unset", async () => {
    delete process.env.LEAD_NOTIFY_EMAILS;
    const { resolveLeadNotifyRecipients } = await import("@/lib/delivery-email");
    expect(resolveLeadNotifyRecipients()).toEqual(["jacob@strelva.com"]);
  });

  it("parses a comma-separated LEAD_NOTIFY_EMAILS list", async () => {
    process.env.LEAD_NOTIFY_EMAILS = "a@x.com, b@y.com ,";
    const { resolveLeadNotifyRecipients } = await import("@/lib/delivery-email");
    expect(resolveLeadNotifyRecipients()).toEqual(["a@x.com", "b@y.com"]);
  });
});

describe("getDeliveryLeads", () => {
  it("returns leads newest-first and hydrates every field", async () => {
    kv.set(
      "lead:old@x.com",
      JSON.stringify({
        businessName: "Old Co",
        email: "old@x.com",
        statusToken: "a".repeat(36),
        deliveryStatus: "received",
        submittedAt: "2026-06-01T00:00:00.000Z",
        statusUpdatedAt: "2026-06-01T00:00:00.000Z",
      }),
    );
    kv.set(
      "lead:new@x.com",
      JSON.stringify({
        businessName: "New Co",
        email: "new@x.com",
        statusToken: "b".repeat(36),
        deliveryStatus: "received",
        submittedAt: "2026-07-01T00:00:00.000Z",
        statusUpdatedAt: "2026-07-01T00:00:00.000Z",
      }),
    );
    zset.push({ score: 100, member: "lead:old@x.com" });
    zset.push({ score: 200, member: "lead:new@x.com" });

    const { getDeliveryLeads } = await import("@/lib/access-request-delivery");
    const leads = await getDeliveryLeads();

    expect(leads.map((l) => l.businessName)).toEqual(["New Co", "Old Co"]);
    expect(leads[0].email).toBe("new@x.com");
  });

  it("degrades to [] when Redis is absent", async () => {
    redisPresent.value = false;
    const { getDeliveryLeads } = await import("@/lib/access-request-delivery");
    expect(await getDeliveryLeads()).toEqual([]);
  });
});

describe("intake route — team notification", () => {
  it("fires the team email with every field and the default recipient on a new lead", async () => {
    const { POST } = await import("@/app/api/access-request/intake/route");

    const response = await POST(
      new Request("http://localhost/api/access-request/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: "Demo Studio",
          email: "owner@example.com",
          phone: "(716) 555-0100",
          location: "Buffalo, NY",
          currentWebsite: "https://example.com",
          plan: "monthly",
          referredBy: "a friend",
          description: "Need a fresh site with booking",
        }),
      }),
    );

    expect(response.status).toBe(200);

    const teamCall = mockSendEmail.mock.calls.find(
      ([arg]) => typeof arg?.subject === "string" && arg.subject.startsWith("New lead:"),
    );
    expect(teamCall).toBeTruthy();
    const sent = teamCall![0];
    expect(sent.subject).toBe("New lead: Demo Studio");
    expect(sent.to).toEqual(["jacob@strelva.com"]);
    for (const value of [
      "owner@example.com",
      "(716) 555-0100",
      "Buffalo, NY",
      "example.com",
      "Monthly plan",
      "a friend",
      "Need a fresh site with booking",
    ]) {
      expect(sent.html).toContain(value);
      expect(sent.text).toContain(value);
    }
    expect(sent.html).toContain("https://strelva.com/admin/leads");
    expect(sent.text).toContain("https://strelva.com/admin/leads");
  });

  it("does NOT fire the team email on a repeat submission", async () => {
    const { POST } = await import("@/app/api/access-request/intake/route");

    await POST(
      new Request("http://localhost/api/access-request/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: "Demo Studio",
          email: "owner@example.com",
          description: "First submission",
        }),
      }),
    );

    mockSendEmail.mockClear();

    const repeat = await POST(
      new Request("http://localhost/api/access-request/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: "Demo Studio",
          email: "Owner@Example.com",
          description: "Second submission",
        }),
      }),
    );

    const repeatBody = await repeat.json();
    expect(repeatBody.repeatSubmission).toBe(true);
    const teamCall = mockSendEmail.mock.calls.find(
      ([arg]) => typeof arg?.subject === "string" && arg.subject.startsWith("New lead:"),
    );
    expect(teamCall).toBeUndefined();
  });
});
