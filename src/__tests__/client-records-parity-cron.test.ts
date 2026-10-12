import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sweep: vi.fn(),
  heartbeat: vi.fn(),
  alertOnce: vi.fn(),
  denied: vi.fn(),
  tenants: vi.fn(),
}));
vi.mock("@/platform/client-records/parity-sweep", () => ({ runClientRecordParitySweep: mocks.sweep }));
vi.mock("@/platform/infra/heartbeat", () => ({ recordHeartbeat: mocks.heartbeat }));
vi.mock("@/platform/infra/monitoring", () => ({ alertOnce: mocks.alertOnce }));
vi.mock("@/lib/cron-auth", () => ({ requireCronRequest: mocks.denied }));
vi.mock("@/lib/tenants", () => ({ getAllTenants: mocks.tenants }));

import { GET } from "@/app/api/cron/client-records-parity/route";
import vercel from "../../vercel.json";

const url = "http://localhost/api/cron/client-records-parity";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.denied.mockReturnValue(null);
  mocks.tenants.mockResolvedValue([{ id: "gldf" }, { id: "rohlax" }]);
});

describe("client-records-parity cron", () => {
  it("is declared daily in vercel.json", () => {
    const cron = vercel.crons.find((c: { path: string }) => c.path === "/api/cron/client-records-parity");
    expect(cron?.schedule).toMatch(/^\d+ \d+ \* \* \*$/);
  });

  it("rejects an unauthenticated call without comparing anything", async () => {
    mocks.denied.mockReturnValue(new Response("no", { status: 401 }));
    const res = await GET(new Request(url));
    expect(res.status).toBe(401);
    expect(mocks.sweep).not.toHaveBeenCalled();
    expect(mocks.heartbeat).not.toHaveBeenCalled();
  });

  it("beats and stays quiet when the dual-write is off", async () => {
    mocks.sweep.mockResolvedValue({ status: "disabled", stores: [], recorded: 0, outOfParity: 0, failed: 0 });
    const res = await GET(new Request(url));
    expect(res.status).toBe(200);
    expect(mocks.alertOnce).not.toHaveBeenCalled();
    expect(mocks.heartbeat).toHaveBeenCalledWith("client-records-parity", expect.objectContaining({ ok: true }));
  });

  it("passes the tenant list and records a healthy run", async () => {
    mocks.sweep.mockImplementation(async (deps: { tenants: () => Promise<string[]> }) => {
      expect(await deps.tenants()).toEqual(["gldf", "rohlax"]);
      return { status: "ran", stores: [], recorded: 10, outOfParity: 0, failed: 0 };
    });
    await GET(new Request(url));
    expect(mocks.heartbeat).toHaveBeenCalledWith("client-records-parity", expect.objectContaining({ ok: true, processed: 10, failed: 0 }));
    expect(mocks.alertOnce).not.toHaveBeenCalled();
  });

  it("alerts on drift but keeps the heartbeat healthy (the check itself worked)", async () => {
    mocks.sweep.mockResolvedValue({ status: "ran", stores: [{ store: "spam_held", status: "recorded", tenants: 2, outOfParity: ["gldf"], errors: [] }], recorded: 10, outOfParity: 1, failed: 0 });
    await GET(new Request(url));
    expect(mocks.alertOnce).toHaveBeenCalledWith("client_records_parity", "high", expect.objectContaining({ outOfParity: 1, stores: "spam_held" }), 20 * 3600);
    expect(mocks.heartbeat).toHaveBeenCalledWith("client-records-parity", expect.objectContaining({ ok: true }));
  });

  it("fails the heartbeat and alerts when Redis or the database is unavailable", async () => {
    mocks.sweep.mockResolvedValue({ status: "unconfigured", stores: [], recorded: 0, outOfParity: 0, failed: 1 });
    await GET(new Request(url));
    expect(mocks.heartbeat).toHaveBeenCalledWith("client-records-parity", expect.objectContaining({ ok: false, failed: 1 }));
    expect(mocks.alertOnce).toHaveBeenCalled();
  });

  it("survives a thrown sweep", async () => {
    mocks.sweep.mockRejectedValue(new Error("boom"));
    const res = await GET(new Request(url));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ failed: 1, error: "boom" });
    expect(mocks.heartbeat).toHaveBeenCalledWith("client-records-parity", expect.objectContaining({ ok: false }));
  });
});

describe("heartbeat registry", () => {
  it("expects the parity cron at least daily", async () => {
    const actual = await vi.importActual<typeof import("@/platform/infra/heartbeat")>("@/platform/infra/heartbeat");
    expect(actual.CRON_MAX_AGE_SECONDS["client-records-parity"]).toBe(26 * 3600);
  });
});
