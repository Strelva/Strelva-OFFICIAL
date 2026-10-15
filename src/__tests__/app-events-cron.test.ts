import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  health: vi.fn(),
  heartbeat: vi.fn(),
  alertOnce: vi.fn(),
  denied: vi.fn(),
  register: vi.fn(),
  releaseOn: vi.fn(),
  mayBeOn: vi.fn(),
}));
vi.mock("@/platform/app-events/dispatcher", () => ({ dispatchAppEvents: mocks.dispatch }));
vi.mock("@/platform/app-events/store", () => ({ readAppEventHealth: mocks.health }));
vi.mock("@/platform/app-events/release", () => ({ appEventsMayBeOn: mocks.mayBeOn }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: mocks.releaseOn }));
vi.mock("@/server/app-events/handlers", () => ({ registerProductAppEventHandlers: mocks.register }));
vi.mock("@/platform/infra/heartbeat", async (original) => ({ ...(await original<typeof import("@/platform/infra/heartbeat")>()), recordHeartbeat: mocks.heartbeat }));
vi.mock("@/platform/infra/monitoring", () => ({ alertOnce: mocks.alertOnce }));
vi.mock("@/lib/cron-auth", () => ({ requireCronRequest: mocks.denied }));

import { GET } from "@/app/api/cron/app-events/route";
import { CRON_MAX_AGE_SECONDS } from "@/platform/infra/heartbeat";
import vercel from "../../vercel.json";

const url = "http://localhost/api/cron/app-events";
const ran = (patch: Record<string, unknown> = {}) => ({
  status: "ran", lanes: 2, delivered: 3, retried: 1, dead: 0, skipped: 0, unregistered: 0, leaseLost: 0,
  webhooks: { delivered: 2, retried: 0, dead: 0, skipped: 0, disabled: 0 }, replays: { delivered: 0, failed: 0 }, purged: null, errors: [] as string[], ...patch,
});
const healthy = { captureOn: true, lanesBehind: 0, lanesRetrying: 0, deadLast24h: 0, emitFailuresLast24h: 0, oldestUndeliveredAt: null };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.denied.mockReturnValue(null);
  mocks.releaseOn.mockReturnValue(true);
  mocks.mayBeOn.mockReturnValue(true);
  mocks.dispatch.mockResolvedValue(ran());
  mocks.health.mockResolvedValue(healthy);
  mocks.alertOnce.mockResolvedValue(undefined);
});

describe("app-events cron", () => {
  it("is declared every five minutes and has a heartbeat window", () => {
    const cron = vercel.crons.find((item: { path: string }) => item.path === "/api/cron/app-events");
    expect(cron?.schedule).toBe("*/5 * * * *");
    expect(CRON_MAX_AGE_SECONDS["app-events"]).toBe(30 * 60);
  });

  it("rejects an unauthenticated call without touching anything", async () => {
    mocks.denied.mockReturnValue(new Response("no", { status: 401 }));
    const response = await GET(new Request(url));
    expect(response.status).toBe(401);
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(mocks.heartbeat).not.toHaveBeenCalled();
  });

  it("with the env off, records a healthy heartbeat and makes no database call", async () => {
    mocks.mayBeOn.mockReturnValue(false);
    const response = await GET(new Request(url));
    expect(await response.json()).toEqual({ status: "disabled" });
    expect(mocks.heartbeat).toHaveBeenCalledWith("app-events", { ok: true, processed: 0 });
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(mocks.health).not.toHaveBeenCalled();
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("with the workspace release off, does the same", async () => {
    mocks.releaseOn.mockReturnValue(false);
    expect((await (await GET(new Request(url))).json()).status).toBe("disabled");
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it("delivers once, registers handlers first, and reports the counts", async () => {
    const response = await GET(new Request(url));
    const body = await response.json();
    expect(mocks.register).toHaveBeenCalledTimes(1);
    expect(mocks.dispatch).toHaveBeenCalledTimes(1);
    expect(mocks.register.mock.invocationCallOrder[0]).toBeLessThan(mocks.dispatch.mock.invocationCallOrder[0]!);
    expect(body).toMatchObject({ status: "ran", delivered: 3, health: healthy });
    expect(mocks.heartbeat).toHaveBeenCalledWith("app-events", { ok: true, processed: 5, failed: 1 });
    expect(mocks.alertOnce).not.toHaveBeenCalled();
  });

  it("alerts on emit failures and on set-aside events, once per window", async () => {
    mocks.dispatch.mockResolvedValue(ran({ dead: 1, webhooks: { delivered: 0, retried: 0, dead: 2, skipped: 0, disabled: 0 } }));
    mocks.health.mockResolvedValue({ ...healthy, emitFailuresLast24h: 4 });
    await GET(new Request(url));
    expect(mocks.alertOnce).toHaveBeenCalledWith("app_event_emit_failures", "high", { count: 4 }, 6 * 3600);
    expect(mocks.alertOnce).toHaveBeenCalledWith("app_event_dead_letters", "medium", { count: 3 }, 6 * 3600);
    expect(mocks.heartbeat).toHaveBeenCalledWith("app-events", expect.objectContaining({ ok: false }));
  });

  it("reports a dispatch error as unhealthy, and survives an unreadable health check", async () => {
    mocks.dispatch.mockResolvedValue(ran({ errors: ["claimLanes failed"] }));
    mocks.health.mockRejectedValue(new Error("down"));
    const response = await GET(new Request(url));
    expect(response.status).toBe(200);
    expect(mocks.heartbeat).toHaveBeenCalledWith("app-events", { ok: false, processed: 5, failed: 2 });
  });
});
