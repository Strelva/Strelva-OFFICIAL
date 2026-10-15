import { beforeEach, describe, expect, it, vi } from "vitest";
import { assertInstalledInquiryConnections } from "@/platform/system-versions/recorded-actor-connections";
const mocks = vi.hoisted(() => ({ user: vi.fn(), db: vi.fn(), assert: vi.fn(async () => {}) }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: mocks.db }));
vi.mock("@/platform/system-versions/required-connections", () => ({ assertRequiredConnections: mocks.assert }));
const userId = "bb000000-0000-4000-8000-000000000001", workspaceId = "bb000000-0000-4000-8000-000000000002";
beforeEach(() => { vi.clearAllMocks(); mocks.db.mockReturnValue({ auth: { admin: { getUserById: mocks.user } } }); });
describe("installed inquiry's retained publication actor", () => {
  it("checks Connections using the current verified principal retained by the claim", async () => {
    mocks.user.mockResolvedValue({ data: { user: { id: userId, email: "owner@example.test", email_confirmed_at: "2026-10-14T00:00:00Z" } }, error: null });
    await assertInstalledInquiryConnections(userId, workspaceId);
    expect(mocks.user).toHaveBeenCalledWith(userId);
    expect(mocks.assert).toHaveBeenCalledWith({ actor: { userId, verifiedEmail: "owner@example.test" }, workspaceId, requiredConnections: [expect.objectContaining({ provider: "resend", access: "act", optional: false })] });
  });
  it.each([
    { data: { user: null }, error: null },
    { data: { user: { id: userId, email: "owner@example.test", email_confirmed_at: null } }, error: null },
    { data: { user: { id: workspaceId, email: "owner@example.test", email_confirmed_at: "2026-10-14" } }, error: null },
    { data: null, error: { message: "unavailable" } },
  ])("fails closed when the claim actor's current verified identity cannot be read", async response => {
    mocks.user.mockResolvedValue(response);
    await expect(assertInstalledInquiryConnections(userId, workspaceId)).rejects.toThrow("Sign in");
    expect(mocks.assert).not.toHaveBeenCalled();
  });
  it("does not manufacture platform authority for an owner link or absent database", async () => {
    await expect(assertInstalledInquiryConnections("owner-link:owner@example.test", workspaceId)).rejects.toThrow();
    expect(mocks.user).not.toHaveBeenCalled();
    mocks.db.mockReturnValue(null);
    await expect(assertInstalledInquiryConnections(userId, workspaceId)).rejects.toThrow();
    expect(mocks.assert).not.toHaveBeenCalled();
  });
});
