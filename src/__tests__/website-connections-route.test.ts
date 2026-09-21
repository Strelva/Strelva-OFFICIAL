import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: null as null | { id: string; email: string; email_confirmed_at: string | null },
  release: true,
  options: vi.fn(),
  connect: vi.fn(),
}));

vi.mock("@/lib/db/server-client", () => ({ getSessionUser: () => state.user }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => state.release }));
vi.mock("@/products/websites/server", () => ({
  listWebsiteCapabilityOptions: state.options,
  connectWebsiteCapabilities: state.connect,
  WebsiteConflictError: class WebsiteConflictError extends Error {},
  WebsiteUnavailableError: class WebsiteUnavailableError extends Error {},
}));

import { GET, POST } from "@/app/api/websites/[workId]/connections/route";

const actor = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "owner@example.com", email_confirmed_at: "2026-09-20T00:00:00.000Z" };
const workId = "22222222-2222-4222-8222-222222222222";
const context = { params: Promise.resolve({ workId }) };
const options = { tenants: [{ tenantId: "northstar", siteName: "Northstar", inquiry: [{ capabilityId: "inquiry-main", version: 3, name: "Requests" }], booking: [] }] };
const record = { workId, workspaceId: "11111111-1111-4111-8111-111111111111", website: { revision: 2 } };

beforeEach(() => {
  state.user = actor;
  state.release = true;
  state.options.mockReset().mockResolvedValue(options);
  state.connect.mockReset().mockResolvedValue(record);
});

describe("website connection HTTP boundary", () => {
  it("returns the direct options shape for an authenticated member", async () => {
    const response = await GET(new Request(`https://strelva.test/api/websites/${workId}/connections`), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(options);
    expect(state.options).toHaveBeenCalledWith(expect.objectContaining({ userId: actor.id }), workId);
  });

  it("returns WebsiteRecord directly and preserves a null disconnect selection", async () => {
    const response = await POST(new Request(`https://strelva.test/api/websites/${workId}/connections`, {
      method: "POST",
      headers: { origin: "https://strelva.test", "sec-fetch-site": "same-origin", "content-type": "application/json" },
      body: JSON.stringify({ expectedRevision: 2, selection: null }),
    }), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(record);
    expect(state.connect).toHaveBeenCalledWith(expect.objectContaining({ userId: actor.id }), workId, { expectedRevision: 2, selection: null });
  });

  it("blocks cross-site connection writes before the service boundary", async () => {
    const response = await POST(new Request(`https://strelva.test/api/websites/${workId}/connections`, {
      method: "POST",
      headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site", "content-type": "application/json" },
      body: JSON.stringify({ expectedRevision: 2, selection: { tenantId: "northstar", inquiryCapabilityId: "inquiry-main" } }),
    }), context);
    expect(response.status).toBe(403);
    expect(state.connect).not.toHaveBeenCalled();
  });
});
