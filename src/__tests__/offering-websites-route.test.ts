import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  release: vi.fn(),
  executeWebsiteBinding: vi.fn(),
}));

vi.mock("@/lib/db/server-client", () => ({ getSessionUser: mocks.session }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: mocks.release }));
vi.mock("@/platform/offerings", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/platform/offerings");
  return {
    ...actual,
    PostgresOfferingStore: class {},
    OfferingService: class {
      executeWebsiteBinding = mocks.executeWebsiteBinding;
    },
  };
});

import { POST } from "@/app/api/offerings/websites/route";
import { OfferingConflictError } from "@/platform/offerings";

const BUSINESS_ID = "98000000-0000-4000-8000-000000000010";
const BINDING_ID = "98000000-0000-4000-8000-000000000020";
const user = {
  id: "98000000-0000-4000-8000-000000000001",
  email: "OWNER@EXAMPLE.COM",
  email_confirmed_at: "2026-09-15T12:00:00.000Z",
};
const websiteBinding = {
  id: BINDING_ID,
  businessId: BUSINESS_ID,
  status: "active",
  tenantId: "fictional-site",
  canOpen: true,
  surface: { id: "managed_website", href: "/client/fictional-site" },
};

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://app.strelva.com/api/offerings/websites", {
    method: "POST",
    headers: {
      origin: "https://app.strelva.com",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("offering website binding route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.release.mockReturnValue(true);
    mocks.session.mockResolvedValue(user);
    mocks.executeWebsiteBinding.mockResolvedValue(websiteBinding);
  });

  it("requires the release gate, a verified session, and same-origin JSON", async () => {
    mocks.release.mockReturnValue(false);
    expect((await POST(post({ action: "bind_managed_website" }))).status).toBe(503);
    expect(mocks.session).not.toHaveBeenCalled();

    mocks.release.mockReturnValue(true);
    mocks.session.mockResolvedValue({ id: user.id, email: user.email });
    expect((await POST(post({ action: "bind_managed_website" }))).status).toBe(401);

    mocks.session.mockResolvedValue(user);
    expect((await POST(post({}, { origin: "https://evil.example", "sec-fetch-site": "cross-site" }))).status).toBe(403);
    expect((await POST(post({}, { "content-type": "text/plain" }))).status).toBe(415);
    expect(mocks.executeWebsiteBinding).not.toHaveBeenCalled();
  });

  it("forwards only server-derived identity and returns one binding envelope", async () => {
    const command = {
      action: "bind_managed_website",
      businessId: BUSINESS_ID,
      tenantId: "fictional-site",
      idempotencyKey: "fictional-site:first",
      actorId: "attacker",
    };
    const response = await POST(post(command));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ websiteBinding });
    expect(mocks.executeWebsiteBinding).toHaveBeenCalledWith(
      { userId: user.id, verifiedEmail: "owner@example.com" },
      command,
    );
  });

  it("maps stale or duplicate attachments to a bounded conflict", async () => {
    mocks.executeWebsiteBinding.mockRejectedValueOnce(new OfferingConflictError());
    const response = await POST(post({
      action: "revoke_managed_website_binding",
      businessId: BUSINESS_ID,
      bindingId: BINDING_ID,
      expectedRevision: 1,
      reason: "Website moved",
    }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "binding_conflict" } });
  });
});
