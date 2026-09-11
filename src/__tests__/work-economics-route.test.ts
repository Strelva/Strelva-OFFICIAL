import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  release: vi.fn(),
  command: vi.fn(),
  read: vi.fn(),
  find: vi.fn(),
}));

vi.mock("@/lib/db/server-client", () => ({ getSessionUser: mocks.session }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: mocks.release }));
vi.mock("@/platform/work-economics/service", () => ({
  executeJobEconomicsCommand: mocks.command,
  readJobEconomics: mocks.read,
  findJobEconomicsForTarget: mocks.find,
}));

import { GET, POST } from "@/app/api/work-economics/route";

const actor = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "Owner@Example.com", email_confirmed_at: "2026-09-11" };
const ledger = {
  id: "33333333-3333-4333-8333-333333333333",
  payerId: actor.id,
  status: "draft",
  productId: "tracker",
  resourceKind: "tracker",
  maxAuthorizedCents: 1000,
  estimateCents: null,
};
const inspection = { job: ledger, usage: [], reservations: [], policy: { accounting: "local_explicit_budget", providerEnforcement: "not_wired", stripeCharged: false, paidProvidersInvoked: false } };

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://strelva.test/api/work-economics", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://strelva.test", ...headers },
    body: JSON.stringify(body),
  });
}

describe("work economics route authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.release.mockReturnValue(true);
    mocks.session.mockResolvedValue(actor);
    mocks.command.mockResolvedValue(inspection);
    mocks.read.mockResolvedValue(inspection);
    mocks.find.mockResolvedValue({ inspection: null, canManage: true });
  });

  it("requires the release gate and a verified session", async () => {
    mocks.release.mockReturnValue(false);
    expect((await GET(new Request("https://strelva.test/api/work-economics?jobId=33333333-3333-4333-8333-333333333333"))).status).toBe(503);
    mocks.release.mockReturnValue(true);
    mocks.session.mockResolvedValue({ id: actor.id, email: actor.email });
    expect((await POST(post({ action: "accept", jobId: ledger.id }))).status).toBe(401);
  });

  it("requires an exact same-origin mutation", async () => {
    expect((await POST(post({ action: "accept", jobId: ledger.id }, { origin: "https://evil.test" }))).status).toBe(403);
    expect(mocks.command).not.toHaveBeenCalled();
  });

  it("returns the stable inspection envelope for a target lookup", async () => {
    const response = await GET(new Request("https://strelva.test/api/work-economics?workspaceId=11111111-1111-4111-8111-111111111111&workId=22222222-2222-4222-8222-222222222222"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ledger: null,
      usage: [],
      currentActorId: actor.id,
      canManage: true,
      canAccept: false,
    });
    expect(mocks.find).toHaveBeenCalledWith({ userId: actor.id, verifiedEmail: "owner@example.com" }, {
      workspaceId: "11111111-1111-4111-8111-111111111111",
      workId: "22222222-2222-4222-8222-222222222222",
    });
  });

  it("keeps the payer decision and operator report behind the server actor", async () => {
    const response = await POST(post({ action: "accept", jobId: ledger.id, payerId: "attacker" }));
    expect(response.status).toBe(200);
    expect(mocks.command).toHaveBeenCalledWith({ userId: actor.id, verifiedEmail: "owner@example.com" }, { action: "accept", jobId: ledger.id, payerId: "attacker" });
    expect((await response.json()).canAccept).toBe(true);
  });

  it("bounds streamed bodies", async () => {
    const response = await POST(post({ action: "report_usage", jobId: ledger.id, idempotencyKey: "x", kind: "model", attribution: "normal", amountCents: 0, text: "x".repeat(70 * 1024) }));
    expect(response.status).toBe(413);
  });
});
