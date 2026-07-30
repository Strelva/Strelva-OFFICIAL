import { beforeEach, describe, expect, it, vi } from "vitest";

const mockIsSuperAdmin = vi.hoisted(() => vi.fn());

// The operator agent only needs the auth gate exercised; its read/propose tools
// and model are never reached on the 403/400 paths. Stub the heavy deps so the
// module imports cleanly in the test environment.
vi.mock("@/lib/auth", () => ({ isSuperAdmin: mockIsSuperAdmin }));
vi.mock("@/lib/ai-models", () => ({
  getPrimaryModel: () => ({ model: {}, label: "test" }),
  getFallbackModel: () => null,
}));
vi.mock("@/lib/portfolio", () => ({
  buildPortfolioSnapshot: vi.fn(),
  getPortfolioSummary: vi.fn(),
}));
vi.mock("@/lib/ops", () => ({ buildOpsReport: vi.fn() }));
vi.mock("@/lib/tenants", () => ({ getAllTenants: vi.fn(), getTenantConfig: vi.fn() }));
vi.mock("@/lib/storage", () => ({ listDrafts: vi.fn(), getAllAuditEvents: vi.fn() }));
vi.mock("@/lib/pay-links", () => ({ listPayLinks: vi.fn() }));

// Drive the model: streamText yields the parts the route reacts to. `tool` and
// `stepCountIs` are pass-throughs so the tools object still builds. This lets us
// assert the __CARD__ channel without a live LLM.
const mockFullStream = vi.hoisted(() => ({ parts: [] as unknown[] }));
vi.mock("ai", () => ({
  tool: (def: unknown) => def,
  stepCountIs: () => 8,
  streamText: () => ({
    fullStream: (async function* () {
      for (const p of mockFullStream.parts) yield p;
    })(),
  }),
}));

function req(body: unknown) {
  return new Request("http://localhost/api/admin/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsSuperAdmin.mockResolvedValue(true);
});

describe("POST /api/admin/agent (operator agent)", () => {
  it("403s a non-super-admin", async () => {
    mockIsSuperAdmin.mockResolvedValue(false);
    const { POST } = await import("@/app/api/admin/agent/route");
    const res = await POST(req({ messages: [{ role: "user", content: "hi" }] }));
    expect(res.status).toBe(403);
  });

  it("400s on a malformed messages payload", async () => {
    const { POST } = await import("@/app/api/admin/agent/route");
    const res = await POST(req({ messages: "not-an-array" }));
    expect(res.status).toBe(400);
  });

  it("400s when messages is missing", async () => {
    const { POST } = await import("@/app/api/admin/agent/route");
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it("streams a __CARD__ for a whitelisted read tool but not for others", async () => {
    mockFullStream.parts = [
      { type: "tool-call", toolName: "read_scan" },
      {
        type: "tool-result",
        toolName: "read_scan",
        output: { scanned: [{ tenant: "acme", siteName: "Acme", grade: "D", overallScore: 41 }], worst: { tenant: "acme" } },
      },
      // Not whitelisted → no card.
      { type: "tool-result", toolName: "read_pay_links", output: { payLinks: [], count: 0 } },
      { type: "text-delta", text: "Acme has the worst site health." },
    ];
    const { POST } = await import("@/app/api/admin/agent/route");
    const res = await POST(req({ messages: [{ role: "user", content: "which client has the worst SEO" }] }));
    expect(res.status).toBe(200);
    const body = await res.text();

    const cardLine = body.split("\n").find((l) => l.startsWith("__CARD__"));
    expect(cardLine).toBeDefined();
    const card = JSON.parse(cardLine!.slice(8));
    expect(card.tool).toBe("read_scan");
    expect(card.data.scanned[0].tenant).toBe("acme");
    // Only the whitelisted tool produced a card.
    expect(body.match(/__CARD__/g)?.length).toBe(1);
    // The agent's own text still streams alongside the card.
    expect(body).toContain("Acme has the worst site health.");
  });

  it("does not emit a __CARD__ when the read tool returned an error", async () => {
    mockFullStream.parts = [
      { type: "tool-result", toolName: "read_scan", output: { error: "No tenant" } },
      { type: "text-delta", text: "No scan on record." },
    ];
    const { POST } = await import("@/app/api/admin/agent/route");
    const res = await POST(req({ messages: [{ role: "user", content: "scan foo" }] }));
    const body = await res.text();
    expect(body).not.toContain("__CARD__");
  });
});
