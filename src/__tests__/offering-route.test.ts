import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  release: vi.fn(),
  list: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("@/lib/db/server-client", () => ({ getSessionUser: mocks.session }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: mocks.release }));
vi.mock("@/platform/offerings", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/platform/offerings");
  return {
    ...actual,
    PostgresOfferingStore: class {},
    OfferingService: class {
      list = mocks.list;
      execute = mocks.execute;
    },
  };
});

import { GET, POST } from "@/app/api/offerings/route";
import { OfferingConflictError } from "@/platform/offerings";

const BUSINESS_ID = "97000000-0000-4000-8000-000000000010";
const INSTALLATION_ID = "97000000-0000-4000-8000-000000000020";
const user = {
  id: "97000000-0000-4000-8000-000000000001",
  email: "OWNER@EXAMPLE.COM",
  email_confirmed_at: "2026-09-15T12:00:00.000Z",
};
const installation = {
  id: INSTALLATION_ID,
  businessId: BUSINESS_ID,
  definitionId: "private_staff_requests",
  status: "active",
};

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://app.strelva.com/api/offerings", {
    method: "POST",
    headers: {
      origin: "https://app.strelva.com",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("offering route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.release.mockReturnValue(true);
    mocks.session.mockResolvedValue(user);
    mocks.list.mockResolvedValue({
      businessId: BUSINESS_ID,
      permissions: { canRead: true, canManage: true, role: "owner" },
      definitions: [],
      installations: [installation],
      websiteBindings: [],
    });
    mocks.execute.mockResolvedValue(installation);
  });

  it("keeps the workspace release gate and verified identity ahead of reads", async () => {
    mocks.release.mockReturnValue(false);
    expect((await GET(new Request(`https://app.strelva.com/api/offerings?businessId=${BUSINESS_ID}`))).status).toBe(503);
    expect(mocks.session).not.toHaveBeenCalled();

    mocks.release.mockReturnValue(true);
    mocks.session.mockResolvedValue({ id: user.id, email: user.email });
    expect((await GET(new Request(`https://app.strelva.com/api/offerings?businessId=${BUSINESS_ID}`))).status).toBe(401);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("keeps an auth source failure distinct from a missing session", async () => {
    mocks.session.mockRejectedValue(new Error("private provider detail"));
    const response = await GET(new Request(`https://app.strelva.com/api/offerings?businessId=${BUSINESS_ID}`));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: "source_unavailable", message: "Offering data is unavailable right now." } });
  });

  it("returns the private collection and forwards only server-derived actor identity", async () => {
    const response = await GET(new Request(`https://app.strelva.com/api/offerings?businessId=${BUSINESS_ID}&installationId=${INSTALLATION_ID}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ businessId: BUSINESS_ID, installations: [installation], websiteBindings: [] });
    expect(mocks.list).toHaveBeenCalledWith(
      { userId: user.id, verifiedEmail: "owner@example.com" },
      BUSINESS_ID,
      INSTALLATION_ID,
    );
  });

  it("requires same-origin JSON before accepting a command", async () => {
    const crossSite = await POST(post({ action: "retire" }, { origin: "https://evil.example", "sec-fetch-site": "cross-site" }));
    expect(crossSite.status).toBe(403);
    expect(await crossSite.json()).toEqual({ error: { code: "invalid_origin", message: "Open Strelva directly to manage offerings." } });
    const wrongType = await POST(post({ action: "retire" }, { "content-type": "text/plain" }));
    expect(wrongType.status).toBe(415);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("returns one stable installation envelope and maps a stale command to 409", async () => {
    const command = { action: "retire", businessId: BUSINESS_ID, installationId: INSTALLATION_ID, expectedRevision: 1, reason: "No longer needed" };
    const response = await POST(post({ ...command, actorId: "attacker" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ installation });
    expect(mocks.execute).toHaveBeenCalledWith({ userId: user.id, verifiedEmail: "owner@example.com" }, { ...command, actorId: "attacker" });

    mocks.execute.mockRejectedValueOnce(new OfferingConflictError());
    const stale = await POST(post(command));
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ error: { code: "installation_conflict" } });
  });
});
