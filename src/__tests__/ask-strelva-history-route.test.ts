import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ actor: vi.fn(), rpc: vi.fn(), systemsFor: vi.fn(async (_actor: { userId: string }, _workspaceId: string) => true) }));

vi.mock("ai", () => ({ tool: (def: unknown) => def, stepCountIs: () => () => true }));
vi.mock("@/platform/infra/auth", () => ({ isSuperAdmin: async () => false }));
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
  beforeEach(() => { mocks.actor.mockReset(); mocks.rpc.mockReset(); mocks.systemsFor.mockReset(); mocks.systemsFor.mockResolvedValue(true); });
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
    });

    it("lists conversations for the business, filtered by System", async () => {
      mocks.actor.mockResolvedValue({ userId: "cccccccc-0000-4000-8000-000000000001", verifiedEmail: "o@example.test" });
      mocks.rpc.mockResolvedValue({ data: [{ id: CONVERSATION, systemId: null, title: "What are my services?", messageCount: 2, mine: true, createdAt: "2026-10-06T10:00:00Z", updatedAt: "2026-10-06T10:00:01Z" }], error: null });
      const response = await get(`workspaceId=${WS}&systemId=${CONVERSATION}`);
      expect(response.status).toBe(200);
      expect((await response.json()).conversations).toHaveLength(1);
      expect(mocks.rpc).toHaveBeenCalledWith("list_ask_conversations", expect.objectContaining({ p_workspace_id: WS, p_system_id: CONVERSATION }));
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
    });

    it("answers a non-member as forbidden and a store failure as unavailable", async () => {
      mocks.actor.mockResolvedValue({ userId: "cccccccc-0000-4000-8000-000000000001", verifiedEmail: "o@example.test" });
      mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "ask_history_access_denied" } });
      expect((await get(`workspaceId=${WS}`)).status).toBe(403);
      mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "connection refused" } });
      expect((await get(`workspaceId=${WS}`)).status).toBe(503);
    });
  });
});
