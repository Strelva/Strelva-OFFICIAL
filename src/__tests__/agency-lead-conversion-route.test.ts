import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ actor: vi.fn(), begin: vi.fn(), complete: vi.fn(), add: vi.fn(), rate: vi.fn() }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedWindowedAsync: mocks.rate }));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: mocks.actor }));
vi.mock("@/products/agency-clients/server", async () => ({
  agencyClientActionSchema: (await import("@/products/agency-clients/contracts")).agencyClientActionSchema,
  agencyAddClientReleaseEnabled: () => true,
  addAgencyClient: mocks.add,
  issueAgencyClientOwnerClaim: vi.fn(),
  AgencyClientError: class extends Error {
    constructor(message: string, readonly status: number, readonly code: string) { super(message); }
  },
}));
vi.mock("@/experience/workspace/leads/leads-server", () => ({
  beginAgencyLeadConversion: mocks.begin,
  completeAgencyLeadConversion: mocks.complete,
  AgencyLeadError: class extends Error {
    constructor(message: string, readonly status: number, readonly code: string) { super(message); }
  },
}));
import { POST } from "@/app/api/workspace/agency-clients/route";
import { AgencyLeadError } from "@/experience/workspace/leads/leads-server";

const agency = "00000000-0000-4000-8000-000000000001";
const business = "00000000-0000-4000-8000-000000000002";
const actor = "00000000-0000-4000-8000-000000000003";
const key = "00000000-0000-4000-8000-000000000004";
const token = "a".repeat(36);
const input = { action: "add", agencyWorkspaceId: agency, name: "Northside Bakery", leadToken: token, idempotencyKey: key };
const result = () => ({ client: {
  additionId: "00000000-0000-4000-8000-000000000005", agencyWorkspaceId: agency, customerWorkspaceId: business,
  name: "Northside Bakery", sourceKind: "url", sourceUrl: null, prospectId: null, factsSeeded: 1, seatId: null,
  addedBy: actor, addedAt: "2026-10-12T10:00:00.000Z", replayed: false,
}, scan: { status: "not_requested", seeded: [], name: null, message: null }, ownerClaim: null, ownerClaimError: null,
website: { connect: "/connect", rebuild: "/rebuild", rebuildOpenToAgency: true }, aiCheck: { status: "not_requested" } });
const request = (body: unknown = input) => new Request("https://app.strelva.com/api/workspace/agency-clients", {
  method: "POST", headers: { origin: "https://app.strelva.com", "Content-Type": "application/json" }, body: JSON.stringify(body),
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({ id: actor, email: "owner@agency.example", email_confirmed_at: "2026-10-12" });
  mocks.rate.mockResolvedValue(false); mocks.begin.mockResolvedValue(undefined); mocks.complete.mockResolvedValue(undefined);
  mocks.add.mockImplementation(async () => result());
});

describe("ordinary agency add-client lead conversion", () => {
  it("fences the lead first, then marks converted only after the exact actor's business exists", async () => {
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ client: { customerWorkspaceId: business }, leadConversion: { status: "converted" } });
    expect(mocks.begin).toHaveBeenCalledWith({ userId: actor, verifiedEmail: "owner@agency.example" }, agency, token, key, input);
    expect(mocks.complete).toHaveBeenCalledWith({ userId: actor, verifiedEmail: "owner@agency.example" }, agency, token, key, business);
    expect(mocks.begin.mock.invocationCallOrder[0]).toBeLessThan(mocks.add.mock.invocationCallOrder[0]!);
    expect(mocks.add.mock.invocationCallOrder[0]).toBeLessThan(mocks.complete.mock.invocationCallOrder[0]!);
  });

  it.each([403, 409, 503])("does not add a client when the lead authority or lock fails (%s)", async status => {
    mocks.begin.mockRejectedValue(new AgencyLeadError("Lead held", status, "agency_lead_held"));
    const response = await POST(request());
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: "Lead held", code: "agency_lead_held" });
    expect(mocks.add).not.toHaveBeenCalled(); expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("preserves the created business when completion fails and retries its original key", async () => {
    mocks.complete.mockRejectedValueOnce(new Error("Read-back unavailable"));
    const first = await POST(request());
    expect(first.status).toBe(201);
    expect(await first.json()).toMatchObject({ client: { customerWorkspaceId: business }, leadConversion: { status: "unconfirmed" } });
    mocks.add.mockResolvedValueOnce({ ...result(), client: { ...result().client, replayed: true } });
    const replay = await POST(request());
    expect(await replay.json()).toMatchObject({ client: { customerWorkspaceId: business, replayed: true }, leadConversion: { status: "converted" } });
    expect(mocks.add.mock.calls.map(([, value]) => value)).toEqual([input, input]);
  });

  it.each(["agency", "actor", "malformed"])("does not mark converted from an unrelated or malformed receipt (%s)", async variant => {
    const body = result();
    if (variant === "agency") body.client.agencyWorkspaceId = business;
    if (variant === "actor") body.client.addedBy = business;
    if (variant === "malformed") body.client.customerWorkspaceId = "invalid";
    mocks.add.mockResolvedValueOnce(body);
    expect((await POST(request())).status).toBe(503);
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("does not begin or complete a conversion for ordinary adds, or malformed lead tokens", async () => {
    const { leadToken: _token, ...ordinary } = input;
    expect((await POST(request(ordinary))).status).toBe(201);
    expect((await POST(request({ ...input, leadToken: "invalid" }))).status).toBe(400);
    expect((await POST(request({ ...input, prospectId: business }))).status).toBe(400);
    expect((await POST(request({ ...input, name: undefined, url: "https://bakery.example" }))).status).toBe(400);
    expect(mocks.begin).not.toHaveBeenCalled(); expect(mocks.complete).not.toHaveBeenCalled();
  });

  it.each(["https://reader:fictional@bakery.example", "https://bakery.example:8080", "javascript:alert(1)"])("rejects unsafe website %s before binding the lead to a request", async url => {
    const response = await POST(request({ ...input, url }));
    expect(response.status).toBe(400); expect(await response.json()).toMatchObject({ code: "agency_client_invalid" });
    expect(mocks.begin).not.toHaveBeenCalled(); expect(mocks.add).not.toHaveBeenCalled();
  });
});
