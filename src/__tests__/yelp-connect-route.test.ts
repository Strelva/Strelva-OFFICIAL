import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), save: vi.fn() }));
vi.mock("@/platform/operator-read-audit/admission", () => ({ authorizeTenantOperatorRead: async () => undefined }));
vi.mock("@/platform/infra/auth", () => ({ getAuthUserId: async () => "u1", verifyAuth: async () => true, requireTenantAccess: async () => null, requireTenantPermission: async () => null }));
vi.mock("@/lib/tenant", () => ({ getTenantFromHeaders: async () => "acme" }));
vi.mock("@/lib/connections", () => ({ saveConnection: mocks.save, getConnection: vi.fn() }));
vi.mock("@/lib/subscription", () => ({ requireActiveSubscription: async () => null }));
vi.mock("@/lib/request-body", () => ({ readJsonObject: async (request: Request) => request.json() }));
vi.mock("@/lib/provider-disconnect", () => ({ disconnectTenantProvider: vi.fn() }));

import { POST } from "@/app/api/connections/yelp/route";

const KEY = "fictional-yelp-key";
const connect = () => POST(new Request("https://app.example.test/api/connections/yelp", { method: "POST", body: JSON.stringify({ apiKey: KEY, businessId: "acme-city" }) }));
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", mocks.fetch); });

describe("connecting Yelp", () => {
  it.each([
    [401, "Yelp refused this API key."],
    [403, "Yelp refused this API key."],
    [404, "Yelp couldn't find that business ID."],
    [429, "Yelp didn't answer. Try again in a minute."],
    [503, "Yelp didn't answer. Try again in a minute."],
  ])("says which part Yelp refused when it answers %s", async (status, message) => {
    mocks.fetch.mockResolvedValue(new Response("{}", { status }));
    const response = await connect();
    expect(response.status).toBe(400);
    const text = JSON.stringify(await response.json());
    expect(text).toContain(message);
    expect(text).not.toContain(KEY);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("says Yelp didn't answer on a network error, and saves a working key", async () => {
    mocks.fetch.mockRejectedValueOnce(new Error("offline"));
    expect(await (await connect()).json()).toEqual({ error: "Yelp didn't answer. Try again in a minute." });
    mocks.fetch.mockResolvedValue(new Response("{}", { status: 200 }));
    expect((await connect()).status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ provider: "yelp", status: "connected" }));
  });
});
