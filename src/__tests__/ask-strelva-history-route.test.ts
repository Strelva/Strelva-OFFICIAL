import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ operator: vi.fn(async () => false), actor: vi.fn(), rpc: vi.fn(), record: vi.fn(), systemsFor: vi.fn(async (_actor: { userId: string }, _workspaceId: string) => true),
  needsYouOn: vi.fn(() => false), decisions: vi.fn(async (..._args: unknown[]): Promise<unknown[]> => []), handled: vi.fn(async (..._args: unknown[]): Promise<unknown[]> => []) }));

vi.mock("@/experience/workspace/needs-you-server", () => ({
  needsYouReleaseEnabled: () => mocks.needsYouOn(),
  needsYouService: () => ({ sync: async () => undefined }),
  needsYouStore: { list: (...args: unknown[]) => mocks.decisions(...args), handled: (...args: unknown[]) => mocks.handled(...args), policies: async () => [], linkedTenants: async () => [] },
}));

vi.mock("@/platform/business-record/service", async importOriginal => ({ ...await importOriginal<typeof import("@/platform/business-record/service")>(), readBusinessRecord: (...args: unknown[]) => mocks.record(...args) }));

vi.mock("ai", () => ({ tool: (def: unknown) => def, stepCountIs: () => () => true }));
vi.mock("@/platform/infra/auth", () => ({ isSuperAdmin: () => mocks.operator() }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedAsync: async () => false }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc: (...args: unknown[]) => mocks.rpc(...args) }) }));
vi.mock("@/platform/workspaces/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/platform/workspaces/http")>();
  return { ...actual, workspaceHttpActor: () => mocks.actor() };
});

// Per-workspace Systems resolution is its own module (release-flags tests);
// here it is on unless a test turns it off for the asked business.
vi.mock("@/platform/systems-release", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/platform/systems-release")>();
  return { ...actual, systemsReleasedFor: (actor: { userId: string }, workspaceId: string) => mocks.systemsFor(actor, workspaceId) };
});

import { GET } from "@/app/api/workspace/ask/route";

const ENV = ["STRELVA_WORKSPACE_RELEASE", "STRELVA_SYSTEMS_RELEASE", "STRELVA_ASK_RELEASE"] as const;
const WS = "11111111-1111-4111-8111-111111111111";
const CONVERSATION = "44444444-4444-4444-8444-444444444444";
const get = (query: string) => GET(new Request(`http://localhost/api/workspace/ask?${query}`));

describe("GET /api/workspace/ask (conversation history)", () => {
  beforeEach(() => { mocks.operator.mockReset(); mocks.operator.mockResolvedValue(false); mocks.actor.mockReset(); mocks.rpc.mockReset(); mocks.record.mockReset(); mocks.record.mockResolvedValue(null); mocks.systemsFor.mockReset(); mocks.systemsFor.mockResolvedValue(true); mocks.needsYouOn.mockReset(); mocks.needsYouOn.mockReturnValue(false); mocks.decisions.mockReset(); mocks.decisions.mockResolvedValue([]); mocks.handled.mockReset(); mocks.handled.mockResolvedValue([]); });
  afterEach(() => { for (const key of ENV) delete process.env[key]; });

  it("is off with the release and reads no session", async () => {
    expect((await get(`workspaceId=${WS}`)).status).toBe(503);
    expect(mocks.actor).not.toHaveBeenCalled();
  });

  describe("with the release on", () => {
    beforeEach(() => { for (const key of ENV) process.env[key] = "1"; });

    it("needs a confirmed account", async () => {
      mocks.actor.mockResolvedValue(null);
      expect((await get(`workspaceId=${WS}`)).status).toBe(401);
    });

    it("rejects malformed ids before reading anything", async () => {
      mocks.actor.mockResolvedValue({ userId: "cccccccc-0000-4000-8000-000000000001", verifiedEmail: "o@example.test" });
      expect((await get("workspaceId=nope")).status).toBe(400);
      expect((await get(`workspaceId=${WS}&systemId=x`)).status).toBe(400);
      expect(mocks.rpc).not.toHaveBeenCalled();
      expect(mocks.record).not.toHaveBeenCalled();
    });

    it("lists conversations for the business, filtered by System", async () => {
      mocks.actor.mockResolvedValue({ userId: "cccccccc-0000-4000-8000-000000000001", verifiedEmail: "o@example.test" });
      mocks.rpc.mockResolvedValue({ data: [{ id: CONVERSATION, systemId: null, title: "What are my services?", messageCount: 2, mine: true, createdAt: "2026-10-06T10:00:00Z", updatedAt: "2026-10-06T10:00:01Z" }], error: null });
      const response = await get(`workspaceId=${WS}&systemId=${CONVERSATION}`);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.conversations).toHaveLength(1);
      expect(body.canAskOnBehalf).toBe(false);
      expect(mocks.rpc).toHaveBeenCalledWith("list_ask_conversations", expect.objectContaining({ p_workspace_id: WS, p_system_id: CONVERSATION }));
    });

    it("joins each draft's decision and receipt into the conversation read, as the reader", async () => {
      const actor = { userId: "cccccccc-0000-4000-8000-000000000001", verifiedEmail: "o@example.test" };
      const ref = "55555555-5555-4555-8555-555555555555";
      mocks.actor.mockResolvedValue(actor);
      mocks.needsYouOn.mockReturnValue(true);
      mocks.rpc.mockResolvedValue({ data: { id: CONVERSATION, systemId: null, title: "Insurance", mine: true, updatedAt: "2026-10-15T10:43:00Z", messages: [
        { id: "66666666-6666-4666-8666-666666666666", seq: 1, role: "assistant", content: "Here it is.", askedOnBehalf: null, createdAt: "2026-10-15T10:14:00Z",
          result: { kind: "draft", items: [{ kind: "draft", status: "queued", ids: [ref], summary: "Insurance", needsYou: { route: "owner_decides", itemRef: ref, decideAt: "/workspace" } }] } },
      ] }, error: null });
      mocks.decisions.mockResolvedValue([
        { id: ref, state: "approved", outcome: "done", outcomeReason: null, receiptRef: "r1", decidedByKind: "owner_link", decidedAt: "2026-10-15T10:41:00Z", openedAt: "2026-10-15T10:14:00Z", actor: { kind: "agency", displayName: "North Studio" }, decidedActor: null },
        { id: "77777777-7777-4777-8777-777777777777", state: "approved", outcome: "done", outcomeReason: null, receiptRef: null, decidedByKind: "session", decidedAt: "2026-10-15T10:41:00Z", openedAt: "2026-10-15T10:00:00Z" },
      ]);
      mocks.handled.mockResolvedValue([{ id: "r1", store: "tenant_events", systemId: null, sentence: "Strelva put it live", at: "2026-10-15T10:43:00Z", changed: null, actor: { kind: "platform" }, evidence: { providerAccepted: true, readBack: "verified" }, undo: { state: "undo" } }, { garbage: true }]);
      mocks.record.mockResolvedValue({ facts: { owner_recipient: { value: { email: "lin@example.test", name: "Dr. Amy Lin" } } }, services: [], people: [] });
      const body = await (await get(`workspaceId=${WS}&conversationId=${CONVERSATION}`)).json();
      expect(Object.keys(body.outcomes)).toEqual([ref]);
      expect(body.outcomes[ref]).toMatchObject({ state: "approved", outcome: "done", sentBy: "North Studio", decidedBy: "Dr. Amy Lin", liveBy: "Strelva", readBackAt: "2026-10-15T10:43:00Z", undo: "available" });
      expect(JSON.stringify(body)).not.toContain("lin@example.test");
      expect(mocks.decisions).toHaveBeenCalledWith(actor, WS, true);
      expect(mocks.handled).toHaveBeenCalledWith(actor, WS, "2026-10-15T10:14:00Z");
    });

    it("leaves drafts as saved when the decision store is off or down", async () => {
      mocks.actor.mockResolvedValue({ userId: "cccccccc-0000-4000-8000-000000000001", verifiedEmail: "o@example.test" });
      mocks.rpc.mockResolvedValue({ data: { id: CONVERSATION, systemId: null, title: "x", mine: true, updatedAt: "2026-10-15T10:43:00Z", messages: [
        { id: "66666666-6666-4666-8666-666666666666", seq: 1, role: "assistant", content: "Here.", askedOnBehalf: null, createdAt: "2026-10-15T10:14:00Z", result: { kind: "draft", items: [{ kind: "draft", needsYou: { itemRef: "r" } }] } },
      ] }, error: null });
      expect(await (await get(`workspaceId=${WS}&conversationId=${CONVERSATION}`)).json()).not.toHaveProperty("outcomes");
      mocks.needsYouOn.mockReturnValue(true);
      mocks.decisions.mockRejectedValue(new Error("down"));
      const response = await get(`workspaceId=${WS}&conversationId=${CONVERSATION}`);
      expect(response.status).toBe(200);
      expect(await response.json()).not.toHaveProperty("outcomes");
    });

    it("names the owner from the business record, never their email", async () => {
      mocks.actor.mockResolvedValue({ userId: "cccccccc-0000-4000-8000-000000000001", verifiedEmail: "o@example.test" });
      mocks.rpc.mockResolvedValue({ data: [], error: null });
      mocks.record.mockResolvedValue({ facts: { owner_recipient: { value: { email: "lin@example.test", name: "Dr. Amy Lin" } } }, services: [], people: [] });
      const body = await (await get(`workspaceId=${WS}`)).json();
      expect(body.owner).toEqual({ name: "Dr. Amy Lin" });
      expect(JSON.stringify(body)).not.toContain("lin@example.test");
    });

    it("returns fact-grounded suggestions only after authorized history access", async () => {
      mocks.actor.mockResolvedValue({ userId: "cccccccc-0000-4000-8000-000000000001", verifiedEmail: "o@example.test" });
      mocks.rpc.mockResolvedValue({ data: [], error: null });
      mocks.record.mockResolvedValue({ facts: { display_name: { value: "Harbor Dental" } }, services: [{ name: "Dental cleaning", active: true, verified: true }] });
      const body = await (await get(`workspaceId=${WS}`)).json();
      expect(body.suggestions).toContain("Draft a clearer explanation of our Dental cleaning service.");
      expect(body.ideas).toContainEqual({ text: "Draft a clearer explanation of our Dental cleaning service.", kind: "website", effect: "Drafts a site change for a yes" });
      expect(body).not.toHaveProperty("owner");
      expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ userId: "cccccccc-0000-4000-8000-000000000001" }), WS);
      expect(body).not.toHaveProperty("record");
    });

    it("a record outage keeps conversation history readable with no guessed facts", async () => {
      mocks.actor.mockResolvedValue({ userId: "cccccccc-0000-4000-8000-000000000001", verifiedEmail: "o@example.test" });
      mocks.rpc.mockResolvedValue({ data: [], error: null });
      mocks.record.mockRejectedValue(new Error("Record unavailable"));
      const response = await get(`workspaceId=${WS}`);
      expect(response.status).toBe(200);
      expect(await response.json()).not.toHaveProperty("suggestions");
    });

    it("enables asked-on-behalf only for a verified Strelva operator", async () => {
      mocks.actor.mockResolvedValue({ userId: "cccccccc-0000-4000-8000-000000000001", verifiedEmail: "o@example.test" });
      mocks.rpc.mockResolvedValue({ data: [], error: null });
      mocks.operator.mockResolvedValue(true);
      expect(await (await get(`workspaceId=${WS}`)).json()).toMatchObject({ canAskOnBehalf: true });
    });

    it("answers someone else's or another business's conversation as not found", async () => {
      mocks.actor.mockResolvedValue({ userId: "cccccccc-0000-4000-8000-000000000001", verifiedEmail: "o@example.test" });
      mocks.rpc.mockResolvedValue({ data: null, error: { message: "ask_conversation_not_found" } });
      expect((await get(`workspaceId=${WS}&conversationId=${CONVERSATION}`)).status).toBe(404);
    });

    it("is off for a business where Systems is off, and reads no history", async () => {
      mocks.actor.mockResolvedValue({ userId: "cccccccc-0000-4000-8000-000000000001", verifiedEmail: "o@example.test" });
      mocks.systemsFor.mockResolvedValue(false);
      expect((await get(`workspaceId=${WS}`)).status).toBe(503);
      expect(mocks.systemsFor).toHaveBeenCalledWith(expect.objectContaining({ userId: "cccccccc-0000-4000-8000-000000000001" }), WS);
      expect(mocks.rpc).not.toHaveBeenCalled();
      expect(mocks.record).not.toHaveBeenCalled();
    });

    it("answers a non-member as forbidden and a store failure as unavailable", async () => {
      mocks.actor.mockResolvedValue({ userId: "cccccccc-0000-4000-8000-000000000001", verifiedEmail: "o@example.test" });
      mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "ask_history_access_denied" } });
      expect((await get(`workspaceId=${WS}`)).status).toBe(403);
      expect(mocks.record).not.toHaveBeenCalled();
      mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "connection refused" } });
      expect((await get(`workspaceId=${WS}`)).status).toBe(503);
    });
  });
});
