import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reconcile: vi.fn(),
  heartbeat: vi.fn(),
  alertOnce: vi.fn(),
  denied: vi.fn(),
  purge: vi.fn(),
  parity: vi.fn(),
  bookingRepair: vi.fn(),
}));
vi.mock("@/platform/bookings/move", () => ({ repairPendingBookings: mocks.bookingRepair }));
vi.mock("@/platform/bookings/legacy-ports", () => ({ legacyBookingPorts: {} }));
vi.mock("@/lib/client-leads", () => ({ reconcileLeadMirror: mocks.reconcile, runLeadReadParity: mocks.parity }));
vi.mock("@/lib/lead-mirror", () => ({ purgeExpiredTenantLeads: mocks.purge }));
vi.mock("@/lib/heartbeat", () => ({ recordHeartbeat: mocks.heartbeat }));
vi.mock("@/lib/monitoring", () => ({ alertOnce: mocks.alertOnce }));
vi.mock("@/lib/cron-auth", () => ({ requireCronRequest: mocks.denied }));

import { GET } from "@/app/api/cron/lead-mirror-reconcile/route";
import vercel from "../../vercel.json";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.denied.mockReturnValue(null);
  mocks.purge.mockResolvedValue({ status: "purged", purged: 0, tenants: 0 });
  mocks.parity.mockResolvedValue({ ran: false, checked: 0, inParity: 0, outOfParity: [], failed: [] });
  mocks.bookingRepair.mockResolvedValue({ checked: 0, repaired: 0, failed: 0, dropped: 0, remaining: 0 });
});

describe("one booking store repair in the reconcile cron", () => {
  it("replays queued booking copies and pages on a backlog", async () => {
    mocks.reconcile.mockResolvedValue({ checked: 0, repaired: 0, failed: 0, missing: 0, remaining: 0 });
    mocks.bookingRepair.mockResolvedValue({ checked: 3, repaired: 1, failed: 2, dropped: 0, remaining: 2 });
    const res = await GET(new Request("http://localhost/api/cron/lead-mirror-reconcile"));
    expect(res.status).toBe(200);
    expect((await res.json()).bookingStore).toMatchObject({ repaired: 1, remaining: 2 });
    expect(mocks.alertOnce).toHaveBeenCalledWith("booking_store_backlog", "high", { remaining: 2, failed: 2 }, 6 * 3600);
  });

  it("a repair that throws never fails the cron", async () => {
    mocks.reconcile.mockResolvedValue({ checked: 0, repaired: 0, failed: 0, missing: 0, remaining: 0 });
    mocks.bookingRepair.mockRejectedValue(new Error("redis down"));
    const res = await GET(new Request("http://localhost/api/cron/lead-mirror-reconcile"));
    expect(res.status).toBe(200);
    expect((await res.json()).bookingStore).toMatchObject({ failed: 1, error: "redis down" });
  });
});

describe("lead read parity in the reconcile cron", () => {
  it("pages when a tenant is out of parity, and reports the run", async () => {
    mocks.reconcile.mockResolvedValue({ checked: 0, repaired: 0, failed: 0, missing: 0, remaining: 0 });
    mocks.parity.mockResolvedValue({ ran: true, checked: 2, inParity: 1, outOfParity: [{ tenant: "t2", missing: 1, mismatched: 0 }], failed: [] });
    const res = await GET(new Request("http://localhost/api/cron/lead-mirror-reconcile"));
    expect(res.status).toBe(200);
    expect((await res.json()).leadParity).toMatchObject({ ran: true, inParity: 1 });
    expect(mocks.alertOnce).toHaveBeenCalledWith("lead_read_parity_failed", "high", { tenants: 1 }, 6 * 3600);
  });

  it("a parity failure never fails the cron", async () => {
    mocks.reconcile.mockResolvedValue({ checked: 0, repaired: 0, failed: 0, missing: 0, remaining: 0 });
    mocks.parity.mockRejectedValue(new Error("redis down"));
    const res = await GET(new Request("http://localhost/api/cron/lead-mirror-reconcile"));
    expect(res.status).toBe(200);
    expect((await res.json()).leadParity).toMatchObject({ ran: false, failed: [{ tenant: "*", reason: "redis down" }] });
  });
});

describe("lead-mirror-reconcile cron", () => {
  it("is declared in vercel.json", () => {
    expect(vercel.crons.map((c: { path: string }) => c.path)).toContain("/api/cron/lead-mirror-reconcile");
  });

  it("rejects an unauthenticated call", async () => {
    mocks.denied.mockReturnValue(new Response("no", { status: 401 }));
    const res = await GET(new Request("http://localhost/api/cron/lead-mirror-reconcile"));
    expect(res.status).toBe(401);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it("records a healthy heartbeat when everything is copied", async () => {
    mocks.reconcile.mockResolvedValue({ checked: 2, repaired: 2, failed: 0, missing: 0, remaining: 0 });
    const res = await GET(new Request("http://localhost/api/cron/lead-mirror-reconcile"));
    expect(res.status).toBe(200);
    expect(mocks.alertOnce).not.toHaveBeenCalled();
    expect(mocks.heartbeat).toHaveBeenCalledWith("lead-mirror-reconcile", { ok: true, processed: 2, failed: 0 });
  });

  it("pages and marks the heartbeat unhealthy while leads stay out of Postgres", async () => {
    mocks.reconcile.mockResolvedValue({ checked: 3, repaired: 1, failed: 2, missing: 0, remaining: 2 });
    await GET(new Request("http://localhost/api/cron/lead-mirror-reconcile"));
    expect(mocks.alertOnce).toHaveBeenCalledWith("lead_mirror_backlog", "high", { remaining: 2, missing: 0, failed: 2 }, 6 * 3600);
    expect(mocks.heartbeat).toHaveBeenCalledWith("lead-mirror-reconcile", { ok: false, processed: 3, failed: 2 });
  });

  it("runs the lead retention purge and reports it without affecting the heartbeat", async () => {
    mocks.reconcile.mockResolvedValue({ checked: 0, repaired: 0, failed: 0, missing: 0, remaining: 0 });
    mocks.purge.mockResolvedValue({ status: "unavailable", reason: "function does not exist" });
    const res = await GET(new Request("http://localhost/api/cron/lead-mirror-reconcile"));
    expect(res.status).toBe(200);
    expect(mocks.purge).toHaveBeenCalledWith(1000);
    expect((await res.json()).retention).toEqual({ status: "unavailable", reason: "function does not exist" });
    expect(mocks.heartbeat).toHaveBeenCalledWith("lead-mirror-reconcile", { ok: true, processed: 0, failed: 0 });
  });
});
