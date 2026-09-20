import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  release: vi.fn(() => true),
  manager: vi.fn(),
  config: vi.fn(),
  createState: vi.fn(() => "signed-state"),
  consumeState: vi.fn(),
  exchange: vi.fn(),
  save: vi.fn(),
  assertWriteAllowed: vi.fn(),
}));

vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: mocks.release }));
vi.mock("@/platform/workspaces/http", () => ({
  workspaceHttpActor: mocks.actor,
  workspaceHttpFailure: vi.fn(() => Response.json({ error: "fixture failure" }, { status: 503 })),
  workspaceJson: (value: unknown, status = 200) => Response.json(value, { status }),
}));
vi.mock("@/products/scheduling/server", () => ({
  assertWorkspaceCalendarManager: mocks.manager,
  calendarOAuthConfiguration: mocks.config,
  createCalendarOAuthState: mocks.createState,
  consumeCalendarOAuthState: mocks.consumeState,
  exchangeCalendarOAuthCode: mocks.exchange,
  calendarOAuthRedirectUri: vi.fn(() => "https://workspace.test/callback"),
  saveWorkspaceCalendarConnection: mocks.save,
  assertWorkspaceCalendarWriteAllowed: mocks.assertWriteAllowed,
}));

import { GET as start } from "@/app/api/workspace/calendar-connections/oauth/[provider]/route";
import { GET as callback } from "@/app/api/workspace/calendar-connections/oauth/[provider]/callback/route";

const actor = { userId: "11111111-1111-4111-8111-111111111111", verifiedEmail: "owner@example.test" };
const workspaceId = "33333333-3333-4333-8333-333333333333";

describe("workspace calendar OAuth HTTP boundary", () => {
  afterEach(() => vi.unstubAllEnvs());

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("APP_URL", "https://workspace.test");
    mocks.release.mockReturnValue(true);
    mocks.actor.mockResolvedValue(actor);
    mocks.manager.mockResolvedValue(undefined);
    mocks.assertWriteAllowed.mockResolvedValue(undefined);
    mocks.config.mockReturnValue({ authorizationUrl: "https://provider.test/authorize?client_id=fixture", scopes: ["calendar.write"] });
    mocks.consumeState.mockResolvedValue({ workspaceId, userId: actor.userId, provider: "outlook" });
    mocks.exchange.mockResolvedValue({ accessToken: "fixture-access", refreshToken: "fixture-refresh", scopes: ["calendar.write"] });
  });

  it("binds the OAuth start redirect to the managed workspace", async () => {
    const response = await start(new Request(`https://workspace.test/api/workspace/calendar-connections/oauth/outlook?workspaceId=${workspaceId}`), { params: Promise.resolve({ provider: "outlook" }) });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("state=signed-state");
    expect(mocks.manager).toHaveBeenCalledWith(actor, workspaceId);
  });

  it("returns to the same workspace after the callback saves an authorized connection", async () => {
    const response = await callback(new Request("https://workspace.test/api/workspace/calendar-connections/oauth/outlook/callback?code=fixture-code&state=signed-state"), { params: Promise.resolve({ provider: "outlook" }) });
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") || "https://invalid.test");
    expect(location.pathname).toBe("/workspace");
    expect(location.searchParams.get("view")).toBe("scheduling");
    expect(location.searchParams.get("workspaceId")).toBe(workspaceId);
    expect(mocks.save).toHaveBeenCalledWith(actor, workspaceId, expect.objectContaining({ calendarId: "pending" }), expect.objectContaining({ accessToken: "fixture-access" }), "authorized");
  });

  it("does not exchange a callback when the signed state is invalid", async () => {
    mocks.consumeState.mockResolvedValue(null);
    const response = await callback(new Request("https://workspace.test/api/workspace/calendar-connections/oauth/outlook/callback?code=fixture-code&state=bad"), { params: Promise.resolve({ provider: "outlook" }) });
    expect(response.status).toBe(307);
    expect(mocks.exchange).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("does not start OAuth after the workspace has stopped new changes", async () => {
    mocks.assertWriteAllowed.mockRejectedValue(Object.assign(new Error("Calendar connection changes are stopped for this workspace."), { name: "WorkspaceConflictError" }));
    const response = await start(new Request(`https://workspace.test/api/workspace/calendar-connections/oauth/outlook?workspaceId=${workspaceId}`), { params: Promise.resolve({ provider: "outlook" }) });
    expect(response.status).toBe(503);
    expect(mocks.createState).not.toHaveBeenCalled();
  });

  it("does not exchange or save OAuth credentials after the workspace has stopped new changes", async () => {
    mocks.assertWriteAllowed.mockRejectedValue(new Error("Calendar connection changes are stopped for this workspace."));
    const response = await callback(new Request("https://workspace.test/api/workspace/calendar-connections/oauth/outlook/callback?code=fixture-code&state=signed-state"), { params: Promise.resolve({ provider: "outlook" }) });
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location") || "https://invalid.test").searchParams.get("calendarError")).toBe("The calendar could not be connected. No booking was sent.");
    expect(mocks.exchange).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
