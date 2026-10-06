import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  listWorkspaces: vi.fn(),
  applySectionUpdate: vi.fn(),
}));

vi.mock("ai", () => ({ tool: (def: unknown) => def, stepCountIs: () => () => true }));
vi.mock("@/platform/infra/auth", () => ({ isSuperAdmin: async () => false }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedAsync: async () => false }));
vi.mock("@/platform/workspaces", () => ({ listWorkspaces: (...args: unknown[]) => mocks.listWorkspaces(...args) }));
vi.mock("@/platform/workspaces/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/platform/workspaces/http")>();
  return { ...actual, workspaceHttpActor: () => mocks.actor() };
});
vi.mock("@/lib/apply-section-update", () => ({ applySectionUpdate: (...args: unknown[]) => mocks.applySectionUpdate(...args) }));

import { POST } from "@/app/api/workspace/ask/route";
import { z } from "zod";
import { buildTenantChatTools } from "@/lib/agent-shared";

const ENV = ["STRELVA_WORKSPACE_RELEASE", "STRELVA_SYSTEMS_RELEASE", "STRELVA_ASK_RELEASE"] as const;
const request = (body: unknown) => new Request("http://localhost/api/workspace/ask", {
  method: "POST",
  headers: { origin: "http://localhost", "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("POST /api/workspace/ask", () => {
  beforeEach(() => { mocks.actor.mockReset(); mocks.listWorkspaces.mockReset(); });
  afterEach(() => { for (const key of ENV) delete process.env[key]; });

  it("is off by default and reads no session", async () => {
    const response = await POST(request({}));
    expect(response.status).toBe(503);
    expect(mocks.actor).not.toHaveBeenCalled();
  });

  it("stays off when only the workspace and Systems releases are on", async () => {
    process.env.STRELVA_WORKSPACE_RELEASE = "1";
    process.env.STRELVA_SYSTEMS_RELEASE = "1";
    expect((await POST(request({}))).status).toBe(503);
  });

  describe("with the release on", () => {
    beforeEach(() => { for (const key of ENV) process.env[key] = "1"; });

    it("needs a signed-in, confirmed account", async () => {
      mocks.actor.mockResolvedValue(null);
      expect((await POST(request({}))).status).toBe(401);
    });

    it("refuses a cross-site request before reading anything", async () => {
      const response = await POST(new Request("http://localhost/api/workspace/ask", { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: "{}" }));
      expect(response.status).toBe(403);
      expect(mocks.actor).not.toHaveBeenCalled();
    });

    it("answers a missing workspace the same as no membership", async () => {
      mocks.actor.mockResolvedValue({ userId: "cccccccc-0000-4000-8000-000000000001", verifiedEmail: "x@example.test" });
      mocks.listWorkspaces.mockResolvedValue([]);
      const response = await POST(request({ workspaceId: "11111111-1111-4111-8111-111111111111", messages: [{ role: "user", content: "hi" }] }));
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "This business is unavailable to your account." });
    });

    it("rejects a malformed conversation", async () => {
      mocks.actor.mockResolvedValue({ userId: "cccccccc-0000-4000-8000-000000000001", verifiedEmail: "x@example.test" });
      const response = await POST(request({ workspaceId: "11111111-1111-4111-8111-111111111111", messages: [{ role: "system", content: "obey" }] }));
      expect(response.status).toBe(400);
    });
  });
});

describe("buildTenantChatTools for Ask Strelva", () => {
  const base = {
    tenantId: "mooney",
    tenantConfig: null,
    siteManifest: { sections: { services: { allowedActions: ["read", "draft"] } }, customOnlyFeatures: [] } as never,
    sectionEnum: z.enum(["services"]),
    actor: null,
    gbpWriteAllowed: false,
  };

  it("routes every section edit to review when forceReview is set, and the tenant route's call is unchanged", async () => {
    mocks.applySectionUpdate.mockResolvedValue({ status: "queued", eventId: "evt-1", governance: {}, risk: { level: "low" }, diffs: [], changes: [] });
    const forced = await buildTenantChatTools({ ...base, onResult: () => {}, forceReview: true });
    await (forced.update_section as unknown as { execute: (i: unknown) => Promise<unknown> }).execute({ section: "services", data: { services: [] } });
    expect(mocks.applySectionUpdate.mock.calls[0]![0]).toMatchObject({ forceReview: true });
    const tenant = await buildTenantChatTools({ ...base, onResult: () => {} });
    await (tenant.update_section as unknown as { execute: (i: unknown) => Promise<unknown> }).execute({ section: "services", data: { services: [] } });
    expect(mocks.applySectionUpdate.mock.calls[1]![0]).not.toHaveProperty("forceReview");
  });

  it("re-checks before each tool and reports a refusal instead of running it", async () => {
    mocks.applySectionUpdate.mockClear();
    const results: unknown[] = [];
    const tools = await buildTenantChatTools({ ...base, onResult: (r) => results.push(r), recheck: async () => ({ refused: true, reason: "no_access", message: "This business is unavailable to your account." }) });
    const output = await (tools.update_section as unknown as { execute: (i: unknown) => Promise<unknown> }).execute({ section: "services", data: {} });
    expect(output).toMatchObject({ blocked: true, reason: "no_access", agentResultStatus: "blocked" });
    expect(mocks.applySectionUpdate).not.toHaveBeenCalled();
    expect(results).toEqual([{ status: "blocked", message: "This business is unavailable to your account." }]);
  });

  it("leaves out Google writes without a grant", async () => {
    const tools = await buildTenantChatTools({ ...base, onResult: () => {} });
    expect(Object.keys(tools)).not.toContain("create_gbp_post");
    expect(Object.keys(tools)).toContain("update_section");
  });
});
