import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Coverage for three chat-agent tools wired into the live chat in route.ts:
 *
 * 1. `get_suggestions` + `create_suggestion` — the proactive-suggestion tools
 *    already used by the dashboard executor must ALSO be registered on the live
 *    chat so "what should I do?" can surface them.
 * 2. `explain_traffic` — runs the deterministic detectTrafficAnomaly detector
 *    over the tenant's daily metrics and returns the anomaly narrative for a
 *    tenant with a real drop, and a clean "steady" signal for a normal tenant.
 *
 * Mirrors the agent-review-reply harness: drive the real POST handler with a
 * stand-in streamText that invokes the chosen tool's `execute`.
 */

type AgentTools = Record<string, { execute: (args: unknown) => Promise<unknown> }>;

let mockDrive: { name: string; args: unknown } | null = null;
let mockCapturedTools: AgentTools = {};
let mockLastOutput: unknown = null;

// Per-test daily metrics feeding getDailyMetrics -> detectTrafficAnomaly.
let mockDailyMetrics: Array<{ date: string; pageViews: number; bookingClicks: number }> = [];

const mockGetSuggestions = vi.fn<() => Promise<unknown>>(() => Promise.resolve([]));
const mockAddSuggestion = vi.fn<(s: unknown) => Promise<unknown>>((s) =>
  Promise.resolve({ id: "sug_1", status: "pending", createdAt: "now", ...(s as object) })
);

/** 28 days ending in a sharp recent drop: 21 baseline days, then 7 low days. */
function droppedMetrics(): Array<{ date: string; pageViews: number; bookingClicks: number }> {
  const out: Array<{ date: string; pageViews: number; bookingClicks: number }> = [];
  for (let i = 0; i < 28; i++) {
    const date = new Date(Date.UTC(2026, 5, 1 + i)).toISOString().slice(0, 10);
    // First 21 days (baseline) ~20 views, last 7 days (recent) ~5 views.
    out.push({ date, pageViews: i < 21 ? 20 : 5, bookingClicks: 0 });
  }
  return out;
}

/** 28 flat days — no meaningful change. */
function normalMetrics(): Array<{ date: string; pageViews: number; bookingClicks: number }> {
  const out: Array<{ date: string; pageViews: number; bookingClicks: number }> = [];
  for (let i = 0; i < 28; i++) {
    const date = new Date(Date.UTC(2026, 5, 1 + i)).toISOString().slice(0, 10);
    out.push({ date, pageViews: 20, bookingClicks: 0 });
  }
  return out;
}

vi.mock("ai", () => ({
  tool: (def: unknown) => def,
  stepCountIs: () => () => true,
  streamText: (opts: { tools: AgentTools }) => {
    mockCapturedTools = opts.tools;
    return {
      fullStream: (async function* () {
        if (!mockDrive) return;
        const output = await opts.tools[mockDrive.name].execute(mockDrive.args);
        mockLastOutput = output;
        yield { type: "tool-call", toolName: mockDrive.name, input: mockDrive.args };
        yield { type: "tool-result", output };
      })(),
    };
  },
}));

vi.mock("@/lib/ai-models", () => ({
  getPrimaryModel: () => ({ model: { id: "primary" }, label: "primary" }),
  getFallbackModel: () => null,
  isTransientModelError: () => false,
}));

vi.mock("@/lib/tenant", () => ({
  getTenantFromHeaders: () => Promise.resolve("test-tenant"),
}));

vi.mock("@/lib/auth", () => ({
  requireTenantAccess: () => Promise.resolve(null),
  requireTenantPermission: () => Promise.resolve(null),
  getAuthUserId: () => Promise.resolve("user_test"),
  isSuperAdmin: () => Promise.resolve(false),
}));

vi.mock("@/lib/rate-limit", () => ({
  isRateLimitedAsync: () => Promise.resolve(false),
}));

vi.mock("@/lib/subscription", () => ({
  requireActiveSubscription: () => Promise.resolve(null),
}));

vi.mock("@/lib/tenants", () => ({
  getTenantConfig: () => Promise.resolve({ siteName: "Rohlax" }),
}));

vi.mock("@/components/templates/registry", () => ({
  getTemplateForTenant: () => Promise.resolve({ id: "wellness", contentSections: ["hero"] }),
}));

vi.mock("@/lib/site-capabilities", () => ({
  getSiteCapabilityManifest: () =>
    Promise.resolve({
      sections: { hero: { allowedActions: ["draft"] } },
      supportsPageConfig: false,
      supportsNavigationConfig: false,
      supportsFooterConfig: false,
      supportsDraftPreview: false,
      supportsInlineEditing: false,
      designTokens: [],
      customOnlyFeatures: [],
      customRequestEndpoint: "/api/custom-request",
    }),
  manifestAllowsAction: () => true,
}));

vi.mock("@/lib/proof-signals", () => ({
  classifySource: () => "owner",
  recordAgentToolCall: vi.fn(),
}));

vi.mock("@/lib/capabilities", () => ({
  capabilityPromptFragment: () => "",
  sanitizePromptValue: (v: unknown) => (typeof v === "string" ? v : ""),
}));

vi.mock("@/lib/connections", () => ({
  getConnections: () => Promise.resolve([]),
  getConnection: () => Promise.resolve(null),
}));

vi.mock("@/lib/suggestions", () => ({
  getSuggestions: (...args: unknown[]) => mockGetSuggestions(...(args as [])),
  addSuggestion: (...args: unknown[]) => mockAddSuggestion(args[0]),
}));

vi.mock("@/lib/storage", () => ({
  getContent: () => Promise.resolve({}),
  getClickCounts: () => Promise.resolve(0),
  logActivity: () => Promise.resolve(),
  getDailyMetrics: () => Promise.resolve(mockDailyMetrics),
}));

async function drainResponse(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value);
  }
  return out;
}

function buildRequest() {
  return new Request("http://localhost/api/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: "What should I do?" }],
    }),
  });
}

async function runAgent(drive: { name: string; args: unknown } | null) {
  mockDrive = drive;
  const { POST } = await import("@/app/api/agent/route");
  const res = await POST(buildRequest());
  return drainResponse(res);
}

describe("agent proactive-suggestion tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDrive = null;
    mockLastOutput = null;
    mockDailyMetrics = normalMetrics();
    mockGetSuggestions.mockResolvedValue([]);
  });

  it("registers get_suggestions and create_suggestion on the live chat tool set", async () => {
    await runAgent(null);

    const toolNames = Object.keys(mockCapturedTools);
    expect(toolNames).toContain("get_suggestions");
    expect(toolNames).toContain("create_suggestion");
  });

  it("get_suggestions returns the tenant's pending suggestions", async () => {
    mockGetSuggestions.mockResolvedValue([
      { id: "s1", type: "growth", title: "Add reviews", description: "d", action: "prompt:go" },
    ]);

    await runAgent({ name: "get_suggestions", args: {} });

    expect(mockGetSuggestions).toHaveBeenCalledWith("test-tenant");
    const output = mockLastOutput as { count: number; suggestions: unknown[] };
    expect(output.count).toBe(1);
    expect(output.suggestions).toHaveLength(1);
  });

  it("create_suggestion writes through addSuggestion for the tenant", async () => {
    await runAgent({
      name: "create_suggestion",
      args: {
        type: "growth",
        title: "Post an update",
        description: "Traffic is soft.",
        action: "prompt:Draft this week's update",
      },
    });

    expect(mockAddSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "test-tenant",
        type: "growth",
        title: "Post an update",
        action: "prompt:Draft this week's update",
      })
    );
  });
});

describe("agent explain_traffic tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDrive = null;
    mockLastOutput = null;
    mockGetSuggestions.mockResolvedValue([]);
  });

  it("returns the anomaly narrative for a tenant with a real traffic drop", async () => {
    mockDailyMetrics = droppedMetrics();

    await runAgent({ name: "explain_traffic", args: {} });

    const output = mockLastOutput as {
      anomaly: { type: string; deltaPct: number } | null;
      headline: string;
      why: string;
      suggestion?: string;
    };
    expect(output.anomaly).not.toBeNull();
    expect(output.anomaly!.type).toBe("drop");
    expect(output.headline).toMatch(/down/i);
    expect(output.why).toBeTruthy();
    expect(output.suggestion).toBeTruthy();
  });

  it("returns a clean steady signal for a normal tenant", async () => {
    mockDailyMetrics = normalMetrics();

    await runAgent({ name: "explain_traffic", args: {} });

    const output = mockLastOutput as { anomaly: unknown | null; headline: string };
    expect(output.anomaly).toBeNull();
    expect(output.headline).toMatch(/steady/i);
  });
});
