import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  heartbeat: vi.fn(),
  alertOnce: vi.fn(),
  denied: vi.fn(),
  enabled: vi.fn(),
}));
vi.mock("@/platform/bookings/lifecycle", () => ({ runBookingLifecycle: mocks.run }));
vi.mock("@/platform/bookings/lifecycle-ports", () => ({ bookingLifecyclePorts: { marker: "real-ports" } }));
vi.mock("@/platform/bookings/flags", () => ({ bookingRemindersEnabled: mocks.enabled }));
vi.mock("@/lib/heartbeat", () => ({ recordHeartbeat: mocks.heartbeat }));
vi.mock("@/lib/monitoring", () => ({ alertOnce: mocks.alertOnce }));
vi.mock("@/lib/cron-auth", () => ({ requireCronRequest: mocks.denied }));

import { GET } from "@/app/api/cron/booking-reminders/route";
import vercel from "../../vercel.json";

const url = "http://localhost/api/cron/booking-reminders";
const summary = { holdsExpired: 1, requestsLapsed: 1, claimed: 2, sent: 2, suppressed: 0, failed: 0, skipped: 0, errors: [] as string[] };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.denied.mockReturnValue(null);
  mocks.enabled.mockReturnValue(true);
  mocks.run.mockResolvedValue(summary);
  mocks.alertOnce.mockResolvedValue(undefined);
});

describe("booking-reminders cron", () => {
  it("is declared every 15 minutes in vercel.json", () => {
    const cron = vercel.crons.find((c: { path: string }) => c.path === "/api/cron/booking-reminders");
    expect(cron?.schedule).toBe("*/15 * * * *");
  });

  it("rejects an unauthenticated call without touching a booking", async () => {
    mocks.denied.mockReturnValue(new Response("no", { status: 401 }));
    const res = await GET(new Request(url));
    expect(res.status).toBe(401);
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.heartbeat).not.toHaveBeenCalled();
  });

  it("with its switch off, records a healthy heartbeat and does nothing", async () => {
    mocks.enabled.mockReturnValue(false);
    const res = await GET(new Request(url));
    expect(await res.json()).toMatchObject({ status: "disabled" });
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.heartbeat).toHaveBeenCalledWith("booking-reminders", { ok: true, processed: 0 });
  });

  it("runs the lifecycle with the real ports and reports it", async () => {
    const res = await GET(new Request(url));
    expect(res.status).toBe(200);
    expect(mocks.run).toHaveBeenCalledWith({ marker: "real-ports" }, expect.objectContaining({ limit: 200 }));
    expect(await res.json()).toMatchObject({ sent: 2, holdsExpired: 1 });
    expect(mocks.heartbeat).toHaveBeenCalledWith("booking-reminders", expect.objectContaining({ ok: true, processed: 4, failed: 0 }));
    expect(mocks.alertOnce).not.toHaveBeenCalled();
  });

  it("pages and marks the heartbeat unhealthy when a step failed", async () => {
    mocks.run.mockResolvedValue({ ...summary, errors: ["lapse: booking_store_failed"], failed: 1 });
    await GET(new Request(url));
    expect(mocks.alertOnce).toHaveBeenCalledWith("booking_reminders_failed", "high", { errors: 1 }, 3600);
    expect(mocks.heartbeat).toHaveBeenCalledWith("booking-reminders", expect.objectContaining({ ok: false, failed: 2 }));
  });
});

describe("booking-reminders heartbeat", () => {
  it("is registered with a window that tolerates two missed runs", async () => {
    const actual = await vi.importActual<{ CRON_MAX_AGE_SECONDS: Record<string, number> }>("@/lib/heartbeat");
    expect(actual.CRON_MAX_AGE_SECONDS["booking-reminders"]).toBe(45 * 60);
  });
});
