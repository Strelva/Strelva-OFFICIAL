import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  workspaceRelease: vi.fn(),
  release: vi.fn(),
  readInstallation: vi.fn(),
}));

vi.mock("@/lib/db/server-client", () => ({ getSessionUser: mocks.user }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: mocks.workspaceRelease }));
vi.mock("@/platform/customers", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/platform/customers");
  return {
    ...actual,
    customersReleaseEnabled: mocks.release,
  };
});
vi.mock("@/server/customers", () => ({
  readCustomerInstallation: mocks.readInstallation,
}));

import { GET } from "@/app/api/customers/[customerId]/resources/[resourceId]/route";
import {
  CustomerAccessError,
  CustomerScopeChangedError,
  CustomerSourceError,
  CustomerUnavailableError,
} from "@/platform/customers";

const organizationId = "10000000-0000-4000-8000-000000000001";
const customerId = "30000000-0000-4000-8000-000000000001";
const resourceId = "40000000-0000-4000-8000-000000000002";
const actor = {
  id: "20000000-0000-4000-8000-000000000001",
  email: "ASSIGNED@EXAMPLE.TEST",
  email_confirmed_at: "2026-09-08",
};

function request(search = `?organizationId=${organizationId}`) {
  return new Request(`https://app.strelva.com/api/customers/${customerId}/resources/${resourceId}${search}`);
}

function params() {
  return { params: Promise.resolve({ customerId, resourceId }) };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.workspaceRelease.mockReturnValue(true);
  mocks.release.mockReturnValue(true);
  mocks.user.mockResolvedValue(actor);
  mocks.readInstallation.mockResolvedValue({
    organizationId,
    customerId,
    resourceId,
    installation: {
      schemaVersion: "1",
      id: "installation-fixture-1",
      brokerageName: "Fictional Brokerage",
      mode: "demo",
      previewHref: "/embed/agency-preview",
      observedAt: "2026-09-08T14:00:00.000Z",
      readiness: [],
    },
  });
});

describe("IMP-05 customer installation API", () => {
  it("keeps both release gates closed before authentication", async () => {
    mocks.release.mockReturnValue(false);
    const response = await GET(request(), params());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: { code: "customers_release_closed", message: "Customers is not enabled for this environment." },
    });
    expect(mocks.user).not.toHaveBeenCalled();

    mocks.release.mockReturnValue(true);
    mocks.workspaceRelease.mockReturnValue(false);
    const workspaceClosed = await GET(request(), params());
    expect(workspaceClosed.status).toBe(503);
    expect(mocks.user).not.toHaveBeenCalled();
  });

  it("requires a confirmed identity and bounded exact route/query inputs", async () => {
    mocks.user.mockResolvedValue({ id: actor.id, email: actor.email });
    expect((await GET(request(), params())).status).toBe(401);

    mocks.user.mockResolvedValue(actor);
    for (const search of [
      "",
      "?organizationId=not-a-uuid",
      `?organizationId=${organizationId}&view=unknown`,
      `?organizationId=${organizationId}&view=receipts&limit=51`,
      `?organizationId=${organizationId}&view=summary&limit=1`,
      `?organizationId=${organizationId}&view=receipt`,
      `?organizationId=${organizationId}&view=receipt&reference=${"x".repeat(2049)}`,
    ]) {
      expect((await GET(request(search), params())).status).toBe(400);
    }
    expect(mocks.readInstallation).not.toHaveBeenCalled();
  });

  it("maps an authentication-provider failure to a bounded source error", async () => {
    mocks.user.mockRejectedValue(new Error("provider response with credentials"));
    const response = await GET(request(), params());
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({
      error: { code: "source_unavailable", message: "Customer data is unavailable right now. Try again later." },
    });
    expect(body).not.toContain("credentials");
  });

  it("returns a private no-store typed management view and forwards only scoped inputs", async () => {
    const response = await GET(request(`?organizationId=${organizationId}&view=receipts&cursor=opaque&limit=2`), params());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.json()).toEqual({
      organizationId,
      customerId,
      resourceId,
      installation: {
        schemaVersion: "1",
        id: "installation-fixture-1",
        brokerageName: "Fictional Brokerage",
        mode: "demo",
        previewHref: "/embed/agency-preview",
        observedAt: "2026-09-08T14:00:00.000Z",
        readiness: [],
      },
    });
    expect(mocks.readInstallation).toHaveBeenCalledWith(
      { userId: actor.id, verifiedEmail: "assigned@example.test" },
      organizationId,
      customerId,
      resourceId,
      "receipts",
      { cursor: "opaque", limit: 2 },
    );
  });

  it("maps inaccessible, scope-race, and source failures without provider details", async () => {
    mocks.readInstallation.mockRejectedValueOnce(new CustomerAccessError());
    expect((await GET(request(), params())).status).toBe(403);

    mocks.readInstallation.mockRejectedValueOnce(new CustomerUnavailableError());
    const missing = await GET(request(), params());
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({
      error: { code: "resource_unavailable", message: "This resource is unavailable to your account." },
    });

    mocks.readInstallation.mockRejectedValueOnce(new CustomerScopeChangedError());
    expect((await GET(request(), params())).status).toBe(409);

    mocks.readInstallation.mockRejectedValueOnce(new CustomerSourceError());
    const unavailable = await GET(request(), params());
    expect(unavailable.status).toBe(503);
    expect(await unavailable.text()).not.toContain("provider");
  });
});
