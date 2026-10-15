import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceAccessError, WorkspaceConflictError } from "@/platform/workspaces/types";

const deps = vi.hoisted(() => ({
  user: null as null | { id: string; email: string; email_confirmed_at: string }, limited: vi.fn(), released: vi.fn(),
  read: vi.fn(), save: vi.fn(), requestLive: vi.fn(), pause: vi.fn(), check: vi.fn(), reveal: vi.fn(),
}));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: async () => deps.user }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => true }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedWindowedAsync: deps.limited }));
vi.mock("@/products/vertical-intake/server", () => ({
  verticalIntakeReleasedFor: deps.released, readIntakeApp: deps.read, saveIntakeDraft: deps.save, requestIntakeLive: deps.requestLive,
  pauseIntake: deps.pause, checkIntakeLive: deps.check, revealIntakeSensitive: deps.reveal,
}));
vi.mock("@/products/connected-sites/server", async () => {
  const store = await import("@/products/connected-sites/store");
  return { ConnectedSiteInputError: store.ConnectedSiteInputError };
});

import { ConnectedSiteInputError } from "@/products/connected-sites/store";
import { GET, POST } from "@/app/api/workspace/vertical-intake/route";

const BUSINESS = "83000000-0000-4000-8000-000000000002";
const SUBMISSION = "83000000-0000-4000-8000-0000000000bb";
const USER = "83000000-0000-4000-8000-000000000001";
const ORIGIN = "http://localhost:3000";
const post = (body: unknown) => POST(new Request(`${ORIGIN}/api/workspace/vertical-intake`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify(body) }));
const get = () => GET(new Request(`${ORIGIN}/api/workspace/vertical-intake?workspaceId=${BUSINESS}&appId=dental_intake`));
const base = { workspaceId: BUSINESS, appId: "dental_intake" };

describe("/api/workspace/vertical-intake", () => {
  beforeEach(() => {
    deps.user = { id: USER, email: "Owner@Example.test", email_confirmed_at: "2026-10-01" };
    deps.limited.mockReset().mockResolvedValue(false);
    deps.released.mockReset().mockResolvedValue(true);
    for (const fn of [deps.read, deps.save, deps.requestLive, deps.pause, deps.check, deps.reveal]) fn.mockReset();
    deps.read.mockResolvedValue({ app: { appId: "dental_intake" } });
    deps.save.mockResolvedValue({ id: "i1", draftRevision: 2 });
    deps.requestLive.mockResolvedValue({ id: "i1" });
    deps.pause.mockResolvedValue({ id: "i1" });
    deps.check.mockResolvedValue({ state: "found" });
    deps.reveal.mockResolvedValue([{ label: "Member ID", value: "ABC123XYZ" }]);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("answers 401 without a confirmed session", async () => {
    deps.user = null;
    expect((await get()).status).toBe(401);
    expect((await post({ action: "request_live", ...base })).status).toBe(401);
    expect(deps.read).not.toHaveBeenCalled();
  });

  it("answers 503 and touches nothing when the App is not released for this person", async () => {
    deps.released.mockResolvedValue(false);
    expect((await get()).status).toBe(503);
    const response = await post({ action: "save", ...base, expectedRevision: 0, config: {} });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Dental intake is not enabled. Nothing changed." });
    expect(deps.read).not.toHaveBeenCalled();
    expect(deps.save).not.toHaveBeenCalled();
    expect(deps.released).toHaveBeenCalledWith({ userId: USER, verifiedEmail: "owner@example.test" }, BUSINESS);
  });

  it("reads the whole state", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ app: { appId: "dental_intake" } });
    expect(deps.read).toHaveBeenCalledWith(expect.objectContaining({ userId: USER }), BUSINESS, "dental_intake");
  });

  it("saves, asks, pauses and checks through the service", async () => {
    expect((await post({ action: "save", ...base, expectedRevision: 1, config: { collectMemberId: false } })).status).toBe(200);
    expect(deps.save).toHaveBeenCalledWith(expect.objectContaining({ userId: USER }), BUSINESS, "dental_intake", 1, { collectMemberId: false });
    expect((await post({ action: "request_live", ...base })).status).toBe(200);
    expect((await post({ action: "pause", ...base, paused: true })).status).toBe(200);
    expect(deps.pause).toHaveBeenCalledWith(expect.anything(), BUSINESS, "dental_intake", true);
    expect(await (await post({ action: "check_live", ...base })).json()).toEqual({ check: { state: "found" } });
  });

  it("maps a stale draft to 409 and a refused person to 403", async () => {
    deps.save.mockRejectedValueOnce(new WorkspaceConflictError("This form changed since you opened it. Reload and try again."));
    const stale = await post({ action: "save", ...base, expectedRevision: 0, config: {} });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ error: "This form changed since you opened it. Reload and try again." });
    deps.requestLive.mockRejectedValueOnce(new WorkspaceAccessError());
    expect((await post({ action: "request_live", ...base })).status).toBe(403);
  });

  it("passes a plain 400 message through", async () => {
    deps.save.mockRejectedValueOnce(new ConnectedSiteInputError("Use a page on your connected website."));
    const response = await post({ action: "save", ...base, expectedRevision: 0, config: { pageUrl: "https://elsewhere.example" } });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Use a page on your connected website." });
  });

  it("reveals a stored value with no-store, and never logs it", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const info = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const response = await post({ action: "reveal", ...base, submissionId: SUBMISSION });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ values: [{ label: "Member ID", value: "ABC123XYZ" }] });
    expect(deps.reveal).toHaveBeenCalledWith(expect.objectContaining({ userId: USER }), BUSINESS, SUBMISSION);
    deps.reveal.mockRejectedValueOnce(new Error("ABC123XYZ failed"));
    const failed = await post({ action: "reveal", ...base, submissionId: SUBMISSION });
    expect(failed.status).toBe(503);
    expect(JSON.stringify(await failed.json())).not.toContain("ABC123XYZ");
    for (const spy of [log, info]) expect(JSON.stringify(spy.mock.calls)).not.toContain("ABC123XYZ");
    log.mockRestore(); info.mockRestore();
  });

  it("rate limits writes, and rejects unknown actions, extra fields and cross-origin posts", async () => {
    deps.limited.mockResolvedValue(true);
    expect((await post({ action: "request_live", ...base })).status).toBe(429);
    expect(deps.requestLive).not.toHaveBeenCalled();
    deps.limited.mockResolvedValue(false);
    expect((await post({ action: "delete", ...base })).status).toBe(400);
    expect((await post({ action: "request_live", ...base, extra: 1 })).status).toBe(400);
    const cross = await POST(new Request(`${ORIGIN}/api/workspace/vertical-intake`, { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: JSON.stringify({ action: "request_live", ...base }) }));
    expect(cross.status).toBe(403);
  });
});
