import { beforeEach, expect, it, vi } from "vitest";
import { ModelBudgetPausedError, ModelBudgetUnavailableError } from "@/platform/infra/business-ai-budget";

const mocks = vi.hoisted(() => ({ stream: vi.fn(), track: vi.fn(), error: vi.fn() }));
vi.mock("@/platform/infra/model-calls", () => ({ streamModelText: mocks.stream }));
vi.mock("@/platform/infra/logger", () => ({ logger: { error: mocks.error } }));
vi.mock("@/platform/infra/monitoring", () => ({ trackError: mocks.track }));
vi.mock("@/platform/infra/auth", () => ({ requireTenantPermission: async () => null, getAuthUserId: async () => "owner", isSuperAdmin: async () => false }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedAsync: async () => false }));
vi.mock("@/lib/tenant", () => ({ getTenantFromHeaders: async () => "client" }));
vi.mock("@/lib/subscription", () => ({ requireActiveSubscription: async () => null }));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: async () => ({ siteName: "Client business" }) }));
vi.mock("@/lib/template-manifests", () => ({ getTemplateManifestForTenant: async () => ({}) }));
vi.mock("@/lib/site-capabilities", () => ({ getSiteCapabilityManifest: async () => ({ designTokens: [], customOnlyFeatures: [] }) }));
vi.mock("@/lib/capabilities", () => ({ capabilityPromptFragment: () => "", sanitizePromptValue: (value: string) => value }));
vi.mock("@/lib/agent-prompt-shared", () => ({ buildAgentSystemPrompt: async () => "Client business" }));
vi.mock("@/lib/agent-shared", () => ({ resolveEditableSections: () => ({ agentEditableSections: [], sectionEnum: [] }), resolveGbpWriteAllowed: async () => false, buildTenantChatTools: async () => ({}), chatToolLabel: () => "" }));
vi.mock("@/lib/proof-signals", () => ({ classifySource: () => "owner", recordAgentToolCall: vi.fn() }));
vi.mock("@/platform/workspaces/http", () => ({ workspaceHttpActor: async () => ({ userId: "owner", verifiedEmail: "owner@example.test" }) }));
import { POST } from "@/app/api/agent/route";

beforeEach(() => vi.resetAllMocks());
it.each([new ModelBudgetPausedError(0, 0, {}), new ModelBudgetUnavailableError()])("explains admission pauses to legacy chat without reporting an outage", async error => {
  mocks.stream.mockRejectedValue(error);
  const response = await POST(new Request("https://app.example.test/api/agent", { method: "POST", body: JSON.stringify({ messages: [{ role: "user", content: "What are our services?" }] }) }));
  const text = await response.text();
  expect(text).toContain(error.message);
  expect(text).not.toContain("try again in a moment");
  expect(mocks.stream).toHaveBeenCalledOnce();
  expect(mocks.stream.mock.calls[0]![1]).toMatchObject({ maxOutputTokens: 4096 });
  expect(mocks.track).not.toHaveBeenCalled();
  expect(mocks.error).not.toHaveBeenCalled();
});
it("still reports a genuine provider outage", async () => {
  const failure = new Error("provider unavailable");
  mocks.stream.mockRejectedValue(failure);
  const response = await POST(new Request("https://app.example.test/api/agent", { method: "POST", body: JSON.stringify({ messages: [{ role: "user", content: "What are our services?" }] }) }));
  expect(await response.text()).toContain("Strelva can't answer right now");
  expect(mocks.track).toHaveBeenCalledWith(failure, { tenant: "client", op: "agent.chat" });
});
