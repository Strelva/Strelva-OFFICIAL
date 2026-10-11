import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  release: vi.fn(() => true),
  list: vi.fn(),
  calendars: vi.fn(),
  configure: vi.fn(),
  revoke: vi.fn(),
}));

vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: mocks.release }));
vi.mock("@/platform/workspaces/http", () => ({
  workspaceHttpActor: mocks.actor,
  workspaceHttpFailure: vi.fn((error: unknown) => Response.json({ error: "fixture failure" }, { status: error && typeof error === "object" && (error as { name?: string }).name === "ZodError" ? 400 : 503 })),
  workspaceJson: (value: unknown, status = 200) => Response.json(value, { status }),
  workspaceWriteGuard: vi.fn(() => null),
  readWorkspaceBody: async (request: Request) => request.json(),
}));
vi.mock("@/products/scheduling/server", () => ({
  listWorkspaceCalendarConnections: mocks.list,
  listWorkspaceProviderCalendars: mocks.calendars,
  configureWorkspaceCalendarConnection: mocks.configure,
  revokeWorkspaceCalendarConnection: mocks.revoke,
}));

import { GET, POST } from "@/app/api/workspace/calendar-connections/route";

const actor = { userId: "11111111-1111-4111-8111-111111111111", verifiedEmail: "owner@example.test" };
const workspaceId = "33333333-3333-4333-8333-333333333333";
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("STRELVA_BOOKING_CALENDAR_REVOKE", "0"); });
afterEach(() => vi.unstubAllEnvs());

describe("calendar connection HTTP boundary", () => {
  it.each([{ provider: "outlook", flag: "0", followUp: true }, { provider: "google", flag: "0", followUp: false }, { provider: "google", flag: "1", followUp: false }, { provider: "outlook", flag: "1", followUp: true }])("returns consent guidance for Outlook regardless of flag: $provider / $flag", async ({ provider, flag, followUp }) => {
    vi.stubEnv("STRELVA_BOOKING_CALENDAR_REVOKE", flag);
    mocks.actor.mockResolvedValue(actor); mocks.revoke.mockResolvedValue({ disconnected: true, receiptId: "receipt-1", revocationOutcome: provider === "outlook" ? "consent_remains" : "revoked", revocationErrorCode: null, localCleanupStatus: "complete" });
    const result = await POST(new Request("https://workspace.test/api/workspace/calendar-connections", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "disconnect", workspaceId, provider }) }));
    expect(result.status).toBe(200);
    const value = await result.json();
    expect(value).toMatchObject({ disconnected: true, revocationOutcome: provider === "outlook" ? "consent_remains" : "revoked", receiptId: "receipt-1" });
    if (followUp) expect(value).toMatchObject({ providerConsentAction: { href: "https://myapps.microsoft.com", message: expect.stringContaining("Microsoft calendar consent has not been removed") } });
    else expect(value).not.toHaveProperty("providerConsentAction");
    expect(mocks.revoke).toHaveBeenCalledWith(actor, workspaceId, provider);
  });

  it("returns successful local disconnect and the failed provider outcome when Google revocation fails", async () => {
    vi.stubEnv("STRELVA_BOOKING_CALENDAR_REVOKE", "1"); mocks.actor.mockResolvedValue(actor);
    mocks.revoke.mockResolvedValueOnce({ disconnected: true, receiptId: "receipt-failed", revocationOutcome: "failed", revocationErrorCode: "http_503", localCleanupStatus: "complete" });
    const result = await POST(new Request("https://workspace.test/api/workspace/calendar-connections", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "disconnect", workspaceId, provider: "google" }) }));
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ disconnected: true, receiptId: "receipt-failed", revocationOutcome: "failed", revocationErrorCode: "http_503" });
  });
  it("returns metadata only and keeps provider credentials outside the projection", async () => {
    mocks.actor.mockResolvedValue(actor);
    mocks.list.mockResolvedValue([{ provider: "outlook", status: "connected", calendarId: "calendar-1", calendarName: "Operations", timeZone: "America/New_York" }]);
    const response = await GET(new Request(`https://workspace.test/api/workspace/calendar-connections?workspaceId=${workspaceId}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ connections: [{ provider: "outlook", status: "connected", calendarId: "calendar-1", calendarName: "Operations", timeZone: "America/New_York" }] });
  });

  it("lists calendars only after an explicit provider discovery request", async () => {
    mocks.actor.mockResolvedValue(actor);
    mocks.calendars.mockResolvedValue([{ id: "calendar-1", name: "Operations", canEdit: true }]);
    const response = await GET(new Request(`https://workspace.test/api/workspace/calendar-connections?workspaceId=${workspaceId}&provider=outlook&list=1`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ calendars: [{ id: "calendar-1", name: "Operations", canEdit: true }] });
    expect(mocks.calendars).toHaveBeenCalledWith(actor, workspaceId, "outlook");
  });

  it("disconnects a provider without accepting browser credentials", async () => {
    mocks.actor.mockResolvedValue(actor);
    mocks.revoke.mockResolvedValue(true);
    const response = await POST(new Request("https://workspace.test/api/workspace/calendar-connections", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "disconnect", workspaceId, provider: "google", accessToken: "forged" }) }));
    expect(response.status).toBe(400);
    expect(mocks.revoke).not.toHaveBeenCalled();
  });

  it("checks the durable exit state before configuring a connection", async () => {
    mocks.actor.mockResolvedValue(actor);
    mocks.configure.mockRejectedValue(Object.assign(new Error("Calendar connection changes are stopped for this workspace."), { name: "WorkspaceConflictError" }));
    const response = await POST(new Request("https://workspace.test/api/workspace/calendar-connections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "configure", workspaceId, connection: { provider: "outlook", calendarId: "calendar-1", calendarName: "Operations", timeZone: "America/New_York", reminderPolicy: { mode: "off" } } }),
    }));
    expect(response.status).toBe(503);
    expect(mocks.configure).toHaveBeenCalled();
  });
});
