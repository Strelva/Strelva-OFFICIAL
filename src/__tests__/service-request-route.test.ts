import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), release: vi.fn(), list: vi.fn(), read: vi.fn(), save: vi.fn(), respond: vi.fn(), linkDelivery: vi.fn(), withdraw: vi.fn() }));
vi.mock("@/lib/db/server-client", () => ({ getSessionUser: mocks.session }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: mocks.release }));
vi.mock("@/platform/service-requests", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/platform/service-requests");
  return {
    ...actual,
    PostgresServiceRequestStore: {
      list: mocks.list,
      read: mocks.read,
      save: mocks.save,
      respond: mocks.respond,
      linkDelivery: mocks.linkDelivery,
      withdraw: mocks.withdraw,
    },
  };
});

import { GET, POST } from "@/app/api/service-requests/route";
import { ServiceRequestConflictError, ServiceRequestStoreError } from "@/platform/service-requests";

const businessId = "10000000-0000-4000-8000-000000000001";
const requestId = "10000000-0000-4000-8000-000000000002";
const user = { id: "10000000-0000-4000-8000-000000000003", email: "OWNER@EXAMPLE.TEST", email_confirmed_at: "2026-09-19T12:00:00.000Z" };
const requestRecord = { id: requestId, businessId, status: "requested", providerAcceptance: { status: "pending" } };

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://app.strelva.com/api/service-requests", {
    method: "POST", headers: { origin: "https://app.strelva.com", "content-type": "application/json", ...headers }, body: JSON.stringify(body),
  });
}

describe("service request route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.release.mockReturnValue(true);
    mocks.session.mockResolvedValue(user);
    mocks.list.mockResolvedValue([requestRecord]);
    mocks.read.mockResolvedValue(requestRecord);
    mocks.save.mockResolvedValue(requestRecord);
    mocks.respond.mockResolvedValue(requestRecord);
    mocks.linkDelivery.mockResolvedValue(requestRecord);
    mocks.withdraw.mockResolvedValue(requestRecord);
  });

  it("returns private, reopenable requests for the selected business", async () => {
    const response = await GET(new Request(`https://app.strelva.com/api/service-requests?businessId=${businessId}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ requests: [requestRecord] });
    expect(mocks.list).toHaveBeenCalledWith({ userId: user.id, verifiedEmail: "owner@example.test" }, { businessId });
  });

  it("exposes the Strelva provider inbox through the same private read route", async () => {
    const response = await GET(new Request("https://app.strelva.com/api/service-requests?providerKind=strelva"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ requests: [requestRecord] });
    expect(mocks.list).toHaveBeenCalledWith({ userId: user.id, verifiedEmail: "owner@example.test" }, { providerKind: "strelva" });
  });

  it("rejects malformed reopen and list identifiers at the route boundary", async () => {
    expect((await GET(new Request("https://app.strelva.com/api/service-requests?businessId=invalid"))).status).toBe(400);
    expect((await GET(new Request("https://app.strelva.com/api/service-requests?requestId=invalid"))).status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("derives identity and rejects cross-site writes before execution", async () => {
    expect((await POST(post({ action: "save" }, { origin: "https://evil.test", "sec-fetch-site": "cross-site" }))).status).toBe(403);
    expect((await POST(post({ action: "save" }, { "content-type": "text/plain" }))).status).toBe(415);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("maps a stale persisted request to a conflict without exposing provider details", async () => {
    mocks.save.mockRejectedValueOnce(new ServiceRequestConflictError("The request changed. Reload before continuing."));
    const response = await POST(post({ action: "save", businessId, status: "requested", request: "Need", outcome: "Result", context: {}, scope: ["scope"], provider: { kind: "strelva" }, idempotencyKey: "request:one" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: { code: "request_conflict", message: "The request changed. Reload before continuing." } });
  });

  it("returns an unavailable response when the persistence boundary cannot read", async () => {
    mocks.list.mockRejectedValueOnce(new ServiceRequestStoreError());
    const response = await GET(new Request(`https://app.strelva.com/api/service-requests?businessId=${businessId}`));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: "source_unavailable", message: "Service request storage is unavailable." } });
  });
});
