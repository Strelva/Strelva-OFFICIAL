import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Trust + gating coverage for the chat agent's Google Business write tools.
 *
 * 1. `upload_gbp_photo` must NEVER upload to Google directly. It queues a
 *    `gbp_photo_draft` pending event (the governed path — the real write
 *    happens on owner approval), exactly like `create_gbp_post` /
 *    `update_business_hours`.
 *
 * 2. The three GBP write tools are GATED: they only register for a local (or
 *    hybrid) business whose owner connected a Google account with the
 *    `business.manage` write scope. An online-only brand, or a tenant with no
 *    connected/scoped Google account, never sees them.
 *
 * Mirrors the agent-review-reply harness: drive the real POST handler with a
 * stand-in streamText that invokes the chosen tool's `execute`.
 */

const GBP_SCOPE = "https://www.googleapis.com/auth/business.manage";

const mockAddEvent = vi.fn();
const mockGetConnections = vi.fn<() => Promise<unknown[]>>(() => Promise.resolve([]));
const mockGetTenantConfig = vi.fn<() => Promise<unknown>>(() =>
  Promise.resolve({ siteName: "GLDF", template: "wellness" })
);

type AgentTools = Record<string, { execute: (args: unknown) => Promise<unknown> }>;

let mockDrive: { name: string; args: unknown } | null = null;
let mockCapturedTools: AgentTools = {};
let mockLastOutput: unknown = null;

vi.mock("@/lib/events", () => ({
  addEvent: (...args: unknown[]) => mockAddEvent(...args),
  getOpenChangeRequest: () => Promise.resolve(null),
}));

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
  getTenantConfig: () => mockGetTenantConfig(),
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
  assertAgentToolCatalog: () => undefined,
  capabilityPromptFragment: () => "",
  sanitizePromptValue: (v: unknown) => (typeof v === "string" ? v : ""),
}));

vi.mock("@/lib/connections", () => ({
  getConnections: () => mockGetConnections(),
  getConnection: () => Promise.resolve({ status: "connected" }),
}));

vi.mock("@/lib/storage", () => ({
  getContent: () => Promise.resolve({}),
  getClickCounts: () => Promise.resolve(0),
  logActivity: () => Promise.resolve(),
}));

vi.mock("@/lib/redis", () => ({
  getRedis: () => null,
}));

vi.mock("@/lib/slack", () => ({
  sendSlackNotification: vi.fn(() => Promise.resolve(true)),
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
    body: JSON.stringify({ messages: [{ role: "user", content: "Add a photo to my Google listing" }] }),
  });
}

async function runAgent(drive: { name: string; args: unknown } | null) {
  mockDrive = drive;
  const { POST } = await import("@/app/api/agent/route");
  const res = await POST(buildRequest());
  return drainResponse(res);
}

/** Local business + Google connected + write scope → GBP write tools available. */
function gbpAvailable() {
  mockGetTenantConfig.mockResolvedValue({ siteName: "GLDF", template: "wellness" });
  mockGetConnections.mockResolvedValue([
    { provider: "google", status: "connected", scopes: [GBP_SCOPE] },
  ]);
}

describe("agent upload_gbp_photo tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDrive = null;
    mockLastOutput = null;
    mockAddEvent.mockResolvedValue({ id: "evt_photo_1" });
    gbpAvailable();
  });

  it("queues a gbp_photo_draft pending event — never uploads to Google directly", async () => {
    await runAgent({
      name: "upload_gbp_photo",
      args: { photoUrl: "https://cdn.example.com/shopfront.jpg", category: "EXTERIOR" },
    });

    expect(mockAddEvent).toHaveBeenCalledTimes(1);
    expect(mockAddEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "test-tenant",
        source: "ai",
        type: "content_update",
        status: "pending",
        metadata: expect.objectContaining({
          kind: "gbp_photo_draft",
          photoUrl: "https://cdn.example.com/shopfront.jpg",
          category: "EXTERIOR",
        }),
      })
    );

    const output = mockLastOutput as { agentResultStatus: string };
    expect(output.agentResultStatus).toBe("queued");
  });

  it("defaults the photo category to ADDITIONAL when unspecified", async () => {
    await runAgent({
      name: "upload_gbp_photo",
      args: { photoUrl: "https://cdn.example.com/team.jpg" },
    });

    expect(mockAddEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ kind: "gbp_photo_draft", category: "ADDITIONAL" }),
      })
    );
  });
});

describe("agent GBP write-tool gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAddEvent.mockResolvedValue({ id: "evt_x" });
  });

  it("registers the GBP write tools for a local business with a scoped Google connection", async () => {
    gbpAvailable();
    await runAgent(null);

    const names = Object.keys(mockCapturedTools);
    expect(names).toContain("create_gbp_post");
    expect(names).toContain("update_business_hours");
    expect(names).toContain("upload_gbp_photo");
  });

  it("hides the GBP write tools when no Google account is connected", async () => {
    mockGetTenantConfig.mockResolvedValue({ siteName: "GLDF", template: "wellness" });
    mockGetConnections.mockResolvedValue([]);
    await runAgent(null);

    const names = Object.keys(mockCapturedTools);
    expect(names).not.toContain("create_gbp_post");
    expect(names).not.toContain("update_business_hours");
    expect(names).not.toContain("upload_gbp_photo");
    // Non-GBP tools still register — gating is scoped to the GBP write set.
    expect(names).toContain("update_section");
    expect(names).toContain("reply_to_review");
  });

  it("hides the GBP write tools when the Google connection lacks the business.manage write scope", async () => {
    mockGetTenantConfig.mockResolvedValue({ siteName: "GLDF", template: "wellness" });
    mockGetConnections.mockResolvedValue([
      { provider: "google", status: "connected", scopes: ["https://www.googleapis.com/auth/calendar.readonly"] },
    ]);
    await runAgent(null);

    const names = Object.keys(mockCapturedTools);
    expect(names).not.toContain("create_gbp_post");
    expect(names).not.toContain("upload_gbp_photo");
  });

  it("hides the GBP write tools for an online-only business even when Google is connected", async () => {
    mockGetTenantConfig.mockResolvedValue({ siteName: "Brandco", template: "food-brand" });
    mockGetConnections.mockResolvedValue([
      { provider: "google", status: "connected", scopes: [GBP_SCOPE] },
    ]);
    await runAgent(null);

    const names = Object.keys(mockCapturedTools);
    expect(names).not.toContain("create_gbp_post");
    expect(names).not.toContain("update_business_hours");
    expect(names).not.toContain("upload_gbp_photo");
  });
});
