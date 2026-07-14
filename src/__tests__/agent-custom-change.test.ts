import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Finding #2 coverage: the agent's request_custom_change tool must create the
 * SAME pending change_request event the dashboard route creates, so the chat
 * path and the dashboard panel share one queue state and the one-active-request
 * wall trips on either path.
 *
 * We drive the real POST handler but mock `streamText` so that, instead of
 * calling a model, it invokes the real `request_custom_change` tool's `execute`
 * (passed in via the `tools` map) with a chosen feature/summary, then asserts
 * the event the tool queued.
 */

const mockAddEvent = vi.fn();
const mockGetOpenChangeRequest = vi.fn<() => Promise<unknown>>(() =>
  Promise.resolve(null)
);
const mockGetTriageDueAt = vi.fn((..._args: unknown[]) => "2026-06-10T00:00:00.000Z");

type AgentTools = Record<string, { execute: (args: unknown) => Promise<unknown> }>;

vi.mock("@/lib/events", () => ({
  addEvent: (...args: unknown[]) => mockAddEvent(...args),
  getOpenChangeRequest: () => mockGetOpenChangeRequest(),
}));

vi.mock("@/lib/custom-repos", () => ({
  getTenantDeliveryModel: () => "custom_repo",
  getCustomRepoMetadata: () => ({
    repoName: "rohlax",
    repoUrl: "https://github.com/x/rohlax",
    localPath: "/repos/rohlax",
    productionUrl: "https://rohlax.com",
    contractVersion: "v1",
  }),
  getTriageDueAt: (...args: unknown[]) => mockGetTriageDueAt(...args),
}));

// Drive the tool through a stand-in streamText: yield a tool-call then a
// tool-result whose output is the actual execute() return value.
vi.mock("ai", () => ({
  tool: (def: unknown) => def,
  stepCountIs: () => () => true,
  streamText: (opts: { tools: AgentTools }) => {
    return {
      fullStream: (async function* () {
        const execute = opts.tools.request_custom_change.execute;
        const output = await execute({ feature: "rewards", summary: "Add a punch-card rewards widget" });
        yield { type: "tool-call", toolName: "request_custom_change", input: { feature: "rewards" } };
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
  getTenantConfig: () =>
    Promise.resolve({
      siteName: "Rohlax",
      siteUrl: "https://rohlax.com",
      customRepo: { productionUrl: "https://rohlax.com" },
    }),
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
      customOnlyFeatures: ["rewards"],
      customRequestEndpoint: "/api/custom-request",
    }),
  manifestAllowsAction: () => true,
}));

vi.mock("@/lib/proof-signals", () => ({
  classifySource: () => "owner",
  recordAgentToolCall: vi.fn(),
}));

vi.mock("@/lib/capabilities", () => ({
  assertAgentToolCatalog: () => undefined,
  capabilityPromptFragment: () => "",
  sanitizePromptValue: (v: unknown) => (typeof v === "string" ? v : ""),
}));

vi.mock("@/lib/dev-access", () => ({
  isDevAccessBypassEnabled: () => false,
}));

vi.mock("@/lib/connections", () => ({
  getConnections: () => Promise.resolve({}),
}));

vi.mock("@/lib/storage", () => ({
  getContent: () => Promise.resolve({}),
  getClickCounts: () => Promise.resolve(0),
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

const originalFetch = global.fetch;

describe("agent request_custom_change tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAddEvent.mockResolvedValue({ id: "evt_agent_1" });
    mockGetOpenChangeRequest.mockResolvedValue(null);
    mockGetTriageDueAt.mockReturnValue("2026-06-10T00:00:00.000Z");
    process.env.SCAFFOLD_CUSTOM_REQUEST_SECRET = "test-secret";
    // The tool POSTs to the custom repo before queuing — make that succeed.
    global.fetch = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.SCAFFOLD_CUSTOM_REQUEST_SECRET;
  });

  function buildRequest() {
    return new Request("http://localhost/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Add a rewards program" }],
      }),
    });
  }

  it("queues a pending change_request after a successful custom-repo POST", async () => {
    const { POST } = await import("@/app/api/agent/route");
    const res = await POST(buildRequest());
    await drainResponse(res);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(mockAddEvent).toHaveBeenCalledTimes(1);
    expect(mockAddEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "test-tenant",
        source: "ai",
        type: "change_request",
        status: "pending",
        body: "Add a punch-card rewards widget",
        metadata: expect.objectContaining({
          feature: "rewards",
          kind: "custom_code_or_design_request",
          workflowStatus: "requested",
          requestedVia: "ai_agent",
        }),
      })
    );
  });

  it("does not fail the tool when event creation throws (non-fatal)", async () => {
    mockAddEvent.mockRejectedValueOnce(new Error("redis down"));
    const { POST } = await import("@/app/api/agent/route");
    const res = await POST(buildRequest());
    const out = await drainResponse(res);

    // The custom-repo POST still happened, and the final result contract is a
    // success (queued) even though the event write failed.
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(out).toContain("__RESULT__");
    expect(out).toContain("queued");
  });
});
