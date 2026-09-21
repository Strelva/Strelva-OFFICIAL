import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  user: vi.fn(), manage: vi.fn(), list: vi.fn(), read: vi.fn(), propose: vi.fn(),
}));
vi.mock("@/lib/db/server-client", () => ({ getSessionUser: boundary.user }));
vi.mock("@/platform/agent-access", () => ({
  manageAgentAccess: boundary.manage,
  listAgentAccess: boundary.list,
  readWithAgentAccess: boundary.read,
  proposeWithAgentAccess: boundary.propose,
}));

import { WorkspaceAccessError } from "@/platform/workspaces/types";
import { POST as managePost } from "@/app/api/agent-access/route";
import { GET as externalGet, POST as externalPost } from "@/app/api/agent-access/work/[workId]/route";

const workId = "22222222-2222-4222-8222-222222222222";
const token = `sta_${"a".repeat(43)}`;
const context = { params: Promise.resolve({ workId }) };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
  boundary.user.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111", email: "owner@example.com", email_confirmed_at: "2026-09-15T12:00:00Z" });
});
afterEach(() => vi.unstubAllEnvs());

describe("agent access HTTP", () => {
  it("issues only from a confirmed same-origin session", async () => {
    const command = { kind: "issue", workId, expectedRevision: 0 };
    boundary.manage.mockResolvedValue({ token, integration: { id: "token-id" } });
    const request = new Request("https://app.strelva.com/api/agent-access", { method: "POST", headers: { origin: "https://app.strelva.com", "content-type": "application/json" }, body: JSON.stringify(command) });
    const response = await managePost(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ token, integration: { id: "token-id" } });
    expect(boundary.manage).toHaveBeenCalledWith({ userId: "11111111-1111-4111-8111-111111111111", verifiedEmail: "owner@example.com" }, command);

    const crossOrigin = await managePost(new Request("https://app.strelva.com/api/agent-access", { method: "POST", headers: { origin: "https://other.example", "content-type": "application/json" }, body: "{}" }));
    expect(crossOrigin.status).toBe(403);
  });

  it("rejects missing or malformed bearer credentials without forwarding them", async () => {
    for (const authorization of [undefined, "Bearer wrong", "Basic secret"]) {
      const headers = authorization ? { authorization } : undefined;
      const response = await externalGet(new Request(`https://app.strelva.com/api/agent-access/work/${workId}`, { headers }), context);
      expect(response.status).toBe(403);
      expect(await response.text()).not.toContain(authorization || "undefined");
    }
    expect(boundary.read).not.toHaveBeenCalled();
  });

  it("binds external reads and proposals to the path work and returns generic cross-work denial", async () => {
    boundary.read.mockResolvedValue({ id: workId, revision: "4" });
    const readResponse = await externalGet(new Request(`https://app.strelva.com/api/agent-access/work/${workId}`, { headers: { authorization: `Bearer ${token}` } }), context);
    expect(readResponse.status).toBe(200);
    expect(boundary.read).toHaveBeenCalledWith(token, workId);

    const proposal = { baseWorkRevision: "4", summary: "Change", proposal: "Change it", evidence: [], costMinor: 0, idempotencyKey: "one" };
    boundary.propose.mockResolvedValue({ contributionId: "proposal-id", status: "pending" });
    const proposed = await externalPost(new Request(`https://app.strelva.com/api/agent-access/work/${workId}`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(proposal) }), context);
    expect(proposed.status).toBe(200);
    expect(boundary.propose).toHaveBeenCalledWith(token, workId, proposal);

    boundary.read.mockRejectedValue(new WorkspaceAccessError());
    const denied = await externalGet(new Request(`https://app.strelva.com/api/agent-access/work/${workId}`, { headers: { authorization: `Bearer ${token}` } }), context);
    expect(denied.status).toBe(403);
    expect(await denied.text()).not.toContain(token);
  });

  it("stops a chunked request at the byte cap without relying on Content-Length", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`{"proposal":"${"a".repeat(30_000)}`));
        controller.enqueue(new TextEncoder().encode("b".repeat(30_000)));
        controller.close();
      },
    });
    const request = new Request(`https://app.strelva.com/api/agent-access/work/${workId}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: stream,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    const response = await externalPost(request, context);
    expect(response.status).toBe(409);
    expect(await response.text()).not.toContain(token);
    expect(boundary.propose).not.toHaveBeenCalled();
  });
});
