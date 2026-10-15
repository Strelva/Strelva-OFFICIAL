import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceAccessError } from "@/platform/workspaces/types";

const mocks = vi.hoisted(() => ({
  admit: vi.fn(),
  getActivity: vi.fn(),
  getInboxItems: vi.fn(),
  trackError: vi.fn(),
}));

vi.mock("@/lib/tenant", () => ({ getTenantFromHeaders: async () => "tenant-a" }));
vi.mock("@/platform/infra/auth", () => ({
  requireTenantAccess: async () => null,
  requireTenantPermission: async () => null,
}));
vi.mock("@/platform/operator-read-audit/admission", () => ({ authorizeTenantOperatorRead: mocks.admit }));
vi.mock("@/lib/storage", () => ({
  getActivity: mocks.getActivity,
  getInboxItems: mocks.getInboxItems,
  markInboxRead: vi.fn(),
  markAllInboxRead: vi.fn(),
}));
vi.mock("@/platform/infra/monitoring", () => ({ trackError: mocks.trackError }));

import { GET as getActivityRoute } from "@/app/api/activity/route";
import { GET as getInboxRoute } from "@/app/api/inbox/route";

const request = new Request("https://example.test/api/x");

describe.each([
  ["activity", getActivityRoute, mocks.getActivity, "activity", { okValue: [{ text: "x" }], okBody: [{ text: "x" }] }],
  ["inbox", getInboxRoute, mocks.getInboxItems, "inbox", { okValue: [{ id: "1", read: false }], okBody: { items: [{ id: "1", read: false }], unreadCount: 1 } }],
] as const)("%s GET", (_name, handler, read, code, ok) => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.admit.mockResolvedValue(undefined);
  });

  it("returns 503 and reports when storage throws", async () => {
    read.mockRejectedValue(new Error("db down"));
    const res = await handler(request);
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe(`${code}_unavailable`);
    expect(mocks.trackError).toHaveBeenCalledTimes(1);
  });

  it("returns 403 without reporting when access is denied", async () => {
    mocks.admit.mockRejectedValue(new WorkspaceAccessError("denied"));
    const res = await handler(request);
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe(`${code}_forbidden`);
    expect(mocks.trackError).not.toHaveBeenCalled();
  });

  it("keeps the success shape", async () => {
    read.mockResolvedValue(ok.okValue);
    const res = await handler(request);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(ok.okBody);
  });
});
