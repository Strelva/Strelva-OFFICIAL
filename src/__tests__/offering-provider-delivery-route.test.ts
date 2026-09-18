import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), release: vi.fn(), list: vi.fn(), execute: vi.fn(), offeringList: vi.fn(), inspect: vi.fn() }));
vi.mock("@/lib/db/server-client", () => ({ getSessionUser: mocks.session }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: mocks.release }));
vi.mock("@/platform/offerings", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/platform/offerings");
  return {
    ...actual,
    PostgresOfferingStore: class {},
    OfferingService: class { list = mocks.offeringList; },
    postgresProviderDeliveries: {},
    ProviderDeliveryService: class { list = mocks.list; execute = mocks.execute; },
  };
});
vi.mock("@/products/operations/server", () => ({
  inspectOperationalAssignment: mocks.inspect, acceptOperationalAssignment: vi.fn(), revokeOperationalAssignment: vi.fn(),
}));

import { GET, POST } from "@/app/api/offerings/provider-delivery/route";
import { OfferingConflictError } from "@/platform/offerings";

const businessId = "30000000-0000-4000-8000-000000000001";
const delivery = { id: "30000000-0000-4000-8000-000000000002", businessId, status: "requested" };
const user = { id: "30000000-0000-4000-8000-000000000003", email: "OWNER@EXAMPLE.TEST", email_confirmed_at: "2026-09-18T12:00:00.000Z" };

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://app.strelva.com/api/offerings/provider-delivery", {
    method: "POST", headers: { origin: "https://app.strelva.com", "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("provider delivery route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.release.mockReturnValue(true);
    mocks.session.mockResolvedValue(user);
    mocks.list.mockResolvedValue([delivery]);
    mocks.execute.mockResolvedValue(delivery);
    mocks.offeringList.mockResolvedValue({ permissions: { canManage: true } });
    mocks.inspect.mockResolvedValue({ assignment: { assigneeUserId: "someone-else" } });
  });

  it("requires release, verified identity, and private no-store reads", async () => {
    mocks.release.mockReturnValue(false);
    expect((await GET(new Request(`https://app.strelva.com/api/offerings/provider-delivery?businessId=${businessId}`))).status).toBe(503);
    mocks.release.mockReturnValue(true);
    mocks.session.mockResolvedValue({ id: user.id, email: user.email });
    expect((await GET(new Request(`https://app.strelva.com/api/offerings/provider-delivery?businessId=${businessId}`))).status).toBe(401);
    mocks.session.mockResolvedValue(user);
    const response = await GET(new Request(`https://app.strelva.com/api/offerings/provider-delivery?businessId=${businessId}`));
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ deliveries: [{ ...delivery, canAccept: false, canManage: true }] });
    expect(mocks.list).toHaveBeenCalledWith({ userId: user.id, verifiedEmail: "owner@example.test" }, businessId);
  });

  it("rejects cross-site and non-JSON changes before service execution", async () => {
    expect((await POST(post({ action: "accept" }, { origin: "https://evil.test", "sec-fetch-site": "cross-site" }))).status).toBe(403);
    expect((await POST(post({ action: "accept" }, { "content-type": "text/plain" }))).status).toBe(415);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("derives the actor server-side and exposes conflicts without private detail", async () => {
    const command = { action: "accept", deliveryId: delivery.id, actorId: "attacker" };
    const response = await POST(post(command));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ delivery });
    expect(mocks.execute).toHaveBeenCalledWith({ userId: user.id, verifiedEmail: "owner@example.test" }, command);
    mocks.execute.mockRejectedValueOnce(new OfferingConflictError("Assignment changed."));
    const conflict = await POST(post(command));
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ error: { code: "delivery_conflict", message: "Assignment changed." } });
  });
});
