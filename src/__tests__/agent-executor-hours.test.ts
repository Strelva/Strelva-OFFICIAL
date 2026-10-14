import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// Positive tool cases serve a converted business. Keep the real model helper's
// admission, and supply only its trusted tenant-to-workspace lookup seam.
const mockBillingWorkspace = vi.hoisted(() => vi.fn());
vi.mock("@/platform/release-flags/store", () => ({
  releaseWorkspaceForTenant: mockBillingWorkspace,
}));
beforeEach(() => {
  mockBillingWorkspace.mockResolvedValue("a0000000-0000-4000-8000-000000000001");
});

/**
 * Governance parity for update_business_hours: the programmatic executor
 * (src/lib/agent-executor.ts) must queue the SAME `gbp_hours_draft` pending
 * event the chat route queues — never publish hours to Google directly. The
 * real write happens on owner approval in event-actions; behavior must not
 * depend on which entry point issued the change.
 */

const mockAddEvent = vi.fn();
const mockUpdateBusinessHours = vi.fn();
const mockSendSlackNotification = vi.fn((..._args: unknown[]) => Promise.resolve());

type ExecutorTools = Record<string, { execute: (args: unknown) => Promise<unknown> }>;

let mockCapturedTools: ExecutorTools = {};
let mockAfterToolError: Error | null = null;

vi.mock("ai", () => ({
  tool: (def: unknown) => def,
  stepCountIs: () => () => true,
  generateText: async (opts: { tools: ExecutorTools }) => {
    mockCapturedTools = opts.tools;
    const input = {
      hours: [
        { day: "MONDAY", open: "09:00", close: "17:00" },
        { day: "SATURDAY", open: "10:00", close: "14:00" },
      ],
    };
    const output = await opts.tools.update_business_hours!.execute(input);
    if (mockAfterToolError) throw mockAfterToolError;
    return {
      text: "done",
      finishReason: "stop",
      steps: [
        {
          stepNumber: 0,
          toolResults: [{ toolName: "update_business_hours", input, output }],
          content: [],
        },
      ],
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    };
  },
}));

vi.mock("@/lib/events", () => ({
  addEvent: (...args: unknown[]) => mockAddEvent(...args),
}));

vi.mock("@/lib/gbp-management", () => ({
  updateBusinessHours: (...args: unknown[]) => mockUpdateBusinessHours(...args),
}));

vi.mock("@/lib/slack", () => ({
  sendSlackNotification: (...args: unknown[]) => mockSendSlackNotification(...args),
}));

vi.mock("@/lib/storage", () => ({
  getSectionTimestamps: () => Promise.resolve({}),
}));

vi.mock("@/platform/infra/redis", () => ({
  getRedis: () => null,
}));

vi.mock("@/components/templates/registry", () => ({
  getTemplateForTenant: () => Promise.resolve({ id: "wellness", contentSections: ["hero"] }),
}));

vi.mock("@/lib/tenants", () => ({
  getTenantConfig: () => Promise.resolve({ id: "gldf", siteName: "GLDF", ownerName: "Jacob" }),
}));

vi.mock("@/lib/capabilities", () => ({
  assertAgentToolCatalog: () => undefined,
  capabilityPromptFragment: () => "",
  sanitizePromptValue: (v: unknown) => (typeof v === "string" ? v : ""),
}));

vi.mock("@/lib/agent-prompt-shared", () => ({
  buildAgentSystemPrompt: () => Promise.resolve("SYSTEM PROMPT"),
  loadAgentPromptContent: () =>
    Promise.resolve({
      sections: ["hero"],
      content: {},
      settings: { siteName: "GLDF" },
      ownerName: "Jacob",
    }),
  logisticsGuardrail: () => "",
  copyVoiceGuard: () => "",
  aboutBlock: () => "ABOUT",
  heroBlock: () => null,
  storyBlock: () => null,
  servicesBlock: () => null,
  eventsBlock: () => null,
  testimonialsBlock: () => null,
  performanceBlock: () => "PERFORMANCE",
}));

vi.mock("@/lib/reports", () => ({
  detectStaleSections: () => [],
}));

vi.mock("@/lib/apply-section-update", () => ({
  applySectionUpdate: vi.fn(),
}));

vi.mock("@/platform/infra/ai-models", () => ({
  getPrimaryModel: () => ({ model: { id: "primary" }, label: "primary" }),
  getFallbackModel: () => null,
  isTransientModelError: () => false,
}));

vi.mock("@/lib/sentry-context", () => ({
  addSentryBreadcrumb: vi.fn(),
}));

vi.mock("@/lib/verify-live", () => ({
  scheduleVerification: vi.fn(),
}));

// The executor now honors the same manifest + GBP gates as the streaming route.
// This test is about the hours-draft event shape, so allow the gate and pass the
// section list through.
vi.mock("@/lib/site-capabilities", () => ({
  getSiteCapabilityManifest: () => Promise.resolve({ sections: {} }),
}));

// Stub only the gates; keep the REAL buildGbpTools so this test exercises the
// shared GBP tool factory (the whole point of the B6 merge).
vi.mock("@/lib/agent-shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agent-shared")>();
  return {
    ...actual,
    resolveGbpWriteAllowed: () => Promise.resolve(true),
    resolveEditableSections: (template: { contentSections: string[] }) => ({
      agentEditableSections: template.contentSections,
      sectionEnum: z.enum(template.contentSections as [string, ...string[]]),
    }),
  };
});

describe("agent-executor update_business_hours", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAddEvent.mockResolvedValue({ id: "evt_hours_1" });
    mockAfterToolError = null;
  });

  it("queues a gbp_hours_draft pending event and never writes to Google directly", async () => {
    const { executeAgentPromptDetailed } = await import("@/lib/agent-executor");
    const trace = await executeAgentPromptDetailed("gldf", "Update our Monday hours to 9-5");

    // Same event shape + metadata.kind as the chat route's version.
    expect(mockAddEvent).toHaveBeenCalledTimes(1);
    expect(mockAddEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "gldf",
        source: "ai",
        type: "content_update",
        title: "Google hours update",
        body: "MONDAY: 09:00-17:00\nSATURDAY: 10:00-14:00",
        status: "pending",
        metadata: {
          kind: "gbp_hours_draft",
          hours: [
            { day: "MONDAY", open: "09:00", close: "17:00" },
            { day: "SATURDAY", open: "10:00", close: "14:00" },
          ],
          // Background execution retains the ordinary owner approval path.
          reviewAudience: "owner",
        },
      })
    );

    // The Google write is approval-gated — the executor must not call it.
    expect(mockUpdateBusinessHours).not.toHaveBeenCalled();

    expect(mockSendSlackNotification).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining("needs owner approval") }),
      "tenant",
      expect.anything(),
    );
    expect(trace.agentResult.status).toBe("queued");
    const output = trace.toolCalls[0]!.output as { agentResultStatus: string; message: string };
    expect(output.agentResultStatus).toBe("queued");
    expect(output.message).toContain("once approved");

    expect(Object.keys(mockCapturedTools)).toContain("update_business_hours");
    expect(mockBillingWorkspace).toHaveBeenCalledExactlyOnceWith("gldf");
  });

  it("fences a tool before dispatch and propagates a later budget refusal", async () => {
    const { ModelBudgetPausedError } = await import("@/platform/infra/business-ai-budget");
    const error = new ModelBudgetPausedError(1, 1, {});
    const beforeToolEffect = vi.fn(async () => {});
    mockAfterToolError = error;
    const { executeAgentPromptDetailed } = await import("@/lib/agent-executor");
    await expect(executeAgentPromptDetailed("gldf", "Update our hours", { beforeToolEffect })).rejects.toBe(error);
    expect(beforeToolEffect).toHaveBeenCalledOnce();
    expect(mockAddEvent).toHaveBeenCalledOnce();
    expect(beforeToolEffect.mock.invocationCallOrder[0]).toBeLessThan(mockAddEvent.mock.invocationCallOrder[0]!);
    expect(mockUpdateBusinessHours).not.toHaveBeenCalled();
  });

  it("pauses without trusted business scope before running tools", async () => {
    mockBillingWorkspace.mockResolvedValue(null);
    mockCapturedTools = {};
    const { executeAgentPromptDetailed } = await import("@/lib/agent-executor");
    await expect(executeAgentPromptDetailed("gldf", "Update our hours"))
      .rejects.toThrow("Usage could not be confirmed");
    expect(mockAddEvent).not.toHaveBeenCalled();
    expect(mockUpdateBusinessHours).not.toHaveBeenCalled();
    expect(mockCapturedTools).toEqual({});
  });
});
