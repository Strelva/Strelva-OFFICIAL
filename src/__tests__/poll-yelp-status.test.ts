import { beforeEach, describe, expect, it, vi } from "vitest";

// The Yelp poll reads once a day. A refused key must read "Needs reconnect"; an
// outage or rate limit must read "error" and heal when Yelp answers again.
const mocks = vi.hoisted(() => ({
  getConnection: vi.fn(), saveConnectionMutation: vi.fn(), updateLastSynced: vi.fn(),
  addEvent: vi.fn(), addReview: vi.fn(), fetch: vi.fn(),
}));

vi.mock("@/lib/cron-auth", () => ({ requireCronRequest: () => null }));
vi.mock("@/platform/infra/heartbeat", () => ({ recordHeartbeat: vi.fn(async () => undefined) }));
vi.mock("@/lib/tenants", () => ({ getAllTenants: async () => [{ id: "acme", active: true, ownerEmail: "o@example.test" }] }));
vi.mock("@/lib/connections", () => ({
  getConnection: mocks.getConnection, saveConnectionMutation: mocks.saveConnectionMutation, updateLastSynced: mocks.updateLastSynced,
}));
vi.mock("@/lib/events", () => ({ addEvent: mocks.addEvent }));
vi.mock("@/lib/reviews", () => ({ addReview: mocks.addReview }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => null }));
vi.mock("@/lib/review-alert", () => ({ maybeAlertNewReview: vi.fn(async () => undefined) }));
vi.mock("@/lib/owner-notice-url", () => ({ ownerNoticeUrl: async () => "https://example.test" }));
vi.mock("@/lib/tenant-urls", () => ({ getTenantDashboardUrl: () => "https://example.test" }));

import { GET } from "@/app/api/cron/poll-yelp/route";

const connection = (status: string) => ({ provider: "yelp", tenantId: "acme", accessToken: "fictional-key", apiKey: "acme-city", status });
const poll = () => GET(new Request("https://app.example.test/api/cron/poll-yelp"));
const yelpReplies = (status: number, body: unknown = {}) => vi.stubGlobal("fetch", mocks.fetch.mockResolvedValue(new Response(JSON.stringify(body), { status })));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.saveConnectionMutation.mockResolvedValue(undefined);
  mocks.updateLastSynced.mockResolvedValue(undefined);
  mocks.addEvent.mockResolvedValue({ id: "e1" });
  mocks.addReview.mockResolvedValue(undefined);
});

describe("poll-yelp connection status", () => {
  it.each([401, 403])("marks the connection needs_reauth when Yelp answers %s", async status => {
    mocks.getConnection.mockResolvedValue(connection("connected"));
    yelpReplies(status);
    await poll();
    expect(mocks.saveConnectionMutation).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "acme" }), { status: "needs_reauth" }, expect.any(String));
  });

  it.each([429, 500, 503])("marks a connected connection error when Yelp answers %s", async status => {
    mocks.getConnection.mockResolvedValue(connection("connected"));
    yelpReplies(status);
    const body = await (await poll()).json();
    expect(mocks.saveConnectionMutation).toHaveBeenCalledWith(expect.anything(), { status: "error" }, expect.any(String));
    expect(body.failed).toBe(1);
  });

  it("leaves an already-error connection as it is on another outage", async () => {
    mocks.getConnection.mockResolvedValue(connection("error"));
    yelpReplies(500);
    await poll();
    expect(mocks.saveConnectionMutation).not.toHaveBeenCalled();
  });

  it("returns an error connection to connected when Yelp answers again", async () => {
    mocks.getConnection.mockResolvedValue(connection("error"));
    yelpReplies(200, { reviews: [], total: 0 });
    await poll();
    expect(mocks.saveConnectionMutation).toHaveBeenCalledWith(expect.anything(), { status: "connected" }, expect.any(String));
  });

  it("does not poll a dead key and does not touch a healthy one", async () => {
    mocks.getConnection.mockResolvedValue(connection("needs_reauth"));
    yelpReplies(200, { reviews: [], total: 0 });
    await poll();
    expect(mocks.fetch).not.toHaveBeenCalled();
    mocks.getConnection.mockResolvedValue(connection("connected"));
    await poll();
    expect(mocks.saveConnectionMutation).not.toHaveBeenCalled();
  });

  it("does not change status on a 404 for the business", async () => {
    mocks.getConnection.mockResolvedValue(connection("connected"));
    yelpReplies(404);
    await poll();
    expect(mocks.saveConnectionMutation).not.toHaveBeenCalled();
  });
});
