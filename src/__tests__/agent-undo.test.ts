import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Governance coverage for the chat agent's `undo_last_change` tool.
 *
 * A revert is a real change, so the tool must behave exactly like the other
 * governed content tools:
 *
 * 1. It identifies the version to restore (the previous version — the state
 *    before the most recent change) and routes that data through the SAME
 *    governed apply path (`applySectionUpdate`) with `forceReview: true`, so
 *    the revert is DRAFTED into the approval queue and never auto-published.
 * 2. Nothing to undo (fewer than two versions) returns a clean `no-op` result,
 *    without calling the apply path — no draft, no corruption.
 * 3. The tool is always registered for an active tenant.
 *
 * Mirrors the gbp-agent-tools / agent-review-reply harness: drive the real POST
 * handler with a stand-in streamText that invokes the chosen tool's `execute`.
 */

type AgentTools = Record<string, { execute: (args: unknown) => Promise<unknown> }>;

const mockApplySectionUpdate = vi.fn();
const mockGetVersions = vi.fn<(...args: unknown[]) => Promise<unknown[]>>(() => Promise.resolve([]));

let mockDrive: { name: string; args: unknown } | null = null;
let mockCapturedTools: AgentTools = {};
let mockLastOutput: unknown = null;

vi.mock("ai", () => ({
  tool: (def: unknown) => def,
  stepCountIs: () => () => true,
  streamText: (opts: { tools: AgentTools }) => {
    mockCapturedTools = opts.tools;
    return {
      fullStream: (async function* () {
        if (!mockDrive) return;
        const output = await opts.tools[mockDrive.name]!.execute(mockDrive.args);
        mockLastOutput = output;
        yield { type: "tool-call", toolName: mockDrive.name, input: mockDrive.args };
        yield { type: "tool-result", output };
      })(),
    };
  },
}));

vi.mock("@/lib/apply-section-update", () => ({
  applySectionUpdate: (...args: unknown[]) => mockApplySectionUpdate(...args),
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
  getTenantConfig: () => Promise.resolve({ siteName: "GLDF", template: "wellness" }),
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
  getConnections: () => Promise.resolve([]),
  getConnection: () => Promise.resolve({ status: "connected" }),
}));

vi.mock("@/lib/storage", () => ({
  getVersions: (...args: unknown[]) => mockGetVersions(...args),
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
    body: JSON.stringify({ messages: [{ role: "user", content: "undo that" }] }),
  });
}

async function runAgent(drive: { name: string; args: unknown } | null) {
  mockDrive = drive;
  const { POST } = await import("@/app/api/agent/route");
  const res = await POST(buildRequest());
  return drainResponse(res);
}

describe("agent undo_last_change tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDrive = null;
    mockLastOutput = null;
    mockGetVersions.mockResolvedValue([]);
    // Default: a governed apply that lands in the review queue (pending).
    mockApplySectionUpdate.mockResolvedValue({
      status: "queued",
      section: "hero",
      eventId: "evt_undo_1",
      governance: { action: "review", reason: "revert" },
      risk: { level: "low", autoApply: true },
      diffs: [],
      changes: [],
    });
  });

  it("is registered for an active tenant", async () => {
    await runAgent(null);
    expect(Object.keys(mockCapturedTools)).toContain("undo_last_change");
  });

  it("drafts a revert to the previous version and queues it pending — never auto-applied", async () => {
    mockGetVersions.mockResolvedValue([
      { id: "v_current", section: "hero", data: { heading: "New headline" }, status: "live" },
      { id: "v_prev", section: "hero", data: { heading: "Old headline" }, status: "rolled-back" },
    ]);

    await runAgent({ name: "undo_last_change", args: { section: "hero" } });

    // Restore is applied through the governed path with the RIGHT version's
    // data and forceReview — not a direct auto-publish.
    expect(mockApplySectionUpdate).toHaveBeenCalledTimes(1);
    expect(mockApplySectionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "test-tenant",
        section: "hero",
        data: { heading: "Old headline" },
        forceReview: true,
      })
    );

    const output = mockLastOutput as {
      success: boolean;
      applied: boolean;
      agentResultStatus: string;
      restoredFromVersionId: string;
      eventId: string;
    };
    expect(output.success).toBe(true);
    expect(output.applied).toBe(false);
    expect(output.agentResultStatus).toBe("queued");
    expect(output.restoredFromVersionId).toBe("v_prev");
    expect(output.eventId).toBe("evt_undo_1");
  });

  it("restores a specific earlier version when a versionId is given", async () => {
    mockGetVersions.mockResolvedValue([
      { id: "v_current", section: "hero", data: { heading: "New" }, status: "live" },
      { id: "v_prev", section: "hero", data: { heading: "Prev" }, status: "rolled-back" },
      { id: "v_old", section: "hero", data: { heading: "Ancient" }, status: "rolled-back" },
    ]);

    await runAgent({ name: "undo_last_change", args: { section: "hero", versionId: "v_old" } });

    expect(mockApplySectionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { heading: "Ancient" }, forceReview: true })
    );
    const output = mockLastOutput as { restoredFromVersionId: string };
    expect(output.restoredFromVersionId).toBe("v_old");
  });

  it("returns a clean no-op when there's no earlier version to go back to", async () => {
    mockGetVersions.mockResolvedValue([
      { id: "v_current", section: "hero", data: { heading: "Only version" }, status: "live" },
    ]);

    await runAgent({ name: "undo_last_change", args: { section: "hero" } });

    // No draft, no restore attempt — nothing to corrupt.
    expect(mockApplySectionUpdate).not.toHaveBeenCalled();

    const output = mockLastOutput as {
      success: boolean;
      nothingToUndo: boolean;
      agentResultStatus: string;
      message: string;
    };
    expect(output.success).toBe(false);
    expect(output.nothingToUndo).toBe(true);
    expect(output.agentResultStatus).toBe("no-op");
    expect(output.message).toMatch(/no earlier version/i);
  });

  it("returns a clean no-op when the requested versionId doesn't exist", async () => {
    mockGetVersions.mockResolvedValue([
      { id: "v_current", section: "hero", data: { heading: "New" }, status: "live" },
      { id: "v_prev", section: "hero", data: { heading: "Prev" }, status: "rolled-back" },
    ]);

    await runAgent({ name: "undo_last_change", args: { section: "hero", versionId: "v_missing" } });

    expect(mockApplySectionUpdate).not.toHaveBeenCalled();
    const output = mockLastOutput as { nothingToUndo: boolean; agentResultStatus: string };
    expect(output.nothingToUndo).toBe(true);
    expect(output.agentResultStatus).toBe("no-op");
  });
});
