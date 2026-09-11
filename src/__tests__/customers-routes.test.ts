import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  workspaceRelease: vi.fn(),
  release: vi.fn(),
  list: vi.fn(),
  read: vi.fn(),
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
  listCustomers: mocks.list,
  readCustomer: mocks.read,
}));

import { GET as listGET } from "@/app/api/customers/route";
import { GET as detailGET } from "@/app/api/customers/[customerId]/route";
import { CustomerAccessError, CustomerStoreError, CustomerUnavailableError } from "@/platform/customers";

const organizationId = "10000000-0000-4000-8000-000000000001";
const customerId = "30000000-0000-4000-8000-000000000001";
const actor = { id: "20000000-0000-4000-8000-000000000001", email: "ASSIGNED@EXAMPLE.TEST", email_confirmed_at: "2026-09-08" };

function listRequest(search = "") {
  return new Request(`https://app.strelva.com/api/customers${search}`);
}

function detailRequest(search = `?organizationId=${organizationId}`) {
  return new Request(`https://app.strelva.com/api/customers/${customerId}${search}`);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.workspaceRelease.mockReturnValue(true);
  mocks.release.mockReturnValue(true);
  mocks.user.mockResolvedValue(actor);
  mocks.list.mockResolvedValue({ organizationId, customers: [] });
  mocks.read.mockResolvedValue({ organizationId, customer: { id: customerId }, resources: [] });
});

describe("IMP-05 Customers API", () => {
  it("keeps the independent Customers release gate closed before auth", async () => {
    mocks.release.mockReturnValue(false);
    const response = await listGET(listRequest(`?organizationId=${organizationId}`));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: { code: "customers_release_closed", message: "Customers is not enabled for this environment." },
    });
    expect(mocks.user).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { id: actor.id, email: actor.email },
    { id: actor.id, email: "not-an-email", email_confirmed_at: "2026-09-08" },
  ])("requires a confirmed Supabase identity", async (user) => {
    mocks.user.mockResolvedValue(user);
    const response = await listGET(listRequest(`?organizationId=${organizationId}`));
    expect(response.status).toBe(401);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("keeps an authentication-provider failure distinct from a missing session", async () => {
    mocks.user.mockRejectedValue(new Error("supabase transport details"));
    const listResponse = await listGET(listRequest(`?organizationId=${organizationId}`));
    expect(listResponse.status).toBe(503);
    const listBody = await listResponse.text();
    expect(JSON.parse(listBody)).toEqual({
      error: { code: "source_unavailable", message: "Customer data is unavailable right now. Try again later." },
    });
    expect(listBody).not.toContain("supabase");

    const detailResponse = await detailGET(detailRequest(), { params: Promise.resolve({ customerId }) });
    expect(detailResponse.status).toBe(503);
  });

  it("validates bounded scope/search/pagination before the repository", async () => {
    for (const search of [
      "?organizationId=not-a-uuid",
      `?organizationId=${organizationId}&q=${"x".repeat(81)}`,
      `?organizationId=${organizationId}&limit=51`,
      `?organizationId=${organizationId}&limit=0`,
      `?organizationId=${organizationId}&cursor=${"x".repeat(1025)}`,
    ]) {
      const response = await listGET(listRequest(search));
      expect(response.status).toBe(400);
    }
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("returns a private no-store typed collection and forwards only approved inputs", async () => {
    mocks.list.mockResolvedValue({ organizationId, customers: [{ id: customerId, displayName: "Alder & Pine Realty" }] });
    const response = await listGET(listRequest(`?organizationId=${organizationId}&q=alder&limit=10&cursor=opaque`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await response.json()).toEqual({ organizationId, customers: [{ id: customerId, displayName: "Alder & Pine Realty" }] });
    expect(mocks.list).toHaveBeenCalledWith(
      { userId: actor.id, verifiedEmail: "assigned@example.test" },
      organizationId,
      { query: "alder", limit: 10, cursor: "opaque" },
    );
  });

  it("maps scoped authorization, missing customer, and storage failures to safe errors", async () => {
    mocks.list.mockRejectedValueOnce(new CustomerAccessError());
    const forbidden = await listGET(listRequest(`?organizationId=${organizationId}`));
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({
      error: { code: "organization_forbidden", message: "This organization is unavailable to your account." },
    });

    mocks.read.mockRejectedValueOnce(new CustomerUnavailableError());
    const missing = await detailGET(detailRequest(), { params: Promise.resolve({ customerId }) });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({
      error: { code: "customer_unavailable", message: "This customer is unavailable to your account." },
    });

    mocks.read.mockRejectedValueOnce(new CustomerStoreError());
    const unavailable = await detailGET(detailRequest(), { params: Promise.resolve({ customerId }) });
    expect(unavailable.status).toBe(503);
    expect(await unavailable.text()).not.toContain("database");
  });

  it("requires the explicit organization context for customer detail", async () => {
    const response = await detailGET(detailRequest(""), { params: Promise.resolve({ customerId }) });
    expect(response.status).toBe(400);
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
