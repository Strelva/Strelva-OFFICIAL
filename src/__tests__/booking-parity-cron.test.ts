import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ run: vi.fn(), heartbeat: vi.fn(), alert: vi.fn(), db: vi.fn() }));
vi.mock("@/platform/bookings/parity-sweep", () => ({ runBookingParitySweep: mocks.run }));
vi.mock("@/platform/infra/heartbeat", () => ({ recordHeartbeat: mocks.heartbeat }));
vi.mock("@/platform/infra/monitoring", () => ({ alertOnce: mocks.alert }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: mocks.db }));
import { GET, maxDuration } from "@/app/api/cron/booking-parity/route";
import vercel from "../../vercel.json";

const result = { status: "ran", recorded: 2, failed: 0, outOfParity: [], errors: [] };
const request = (authorized = true) => new Request("http://localhost/api/cron/booking-parity", { headers: authorized ? { authorization: "Bearer fixture-cron" } : {} });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "fixture-cron");
  mocks.run.mockResolvedValue(result);
  mocks.heartbeat.mockResolvedValue(undefined);
  mocks.alert.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("daily booking parity cron", () => {
  it("is scheduled once daily with a bounded run and heartbeat window", async () => {
    expect(vercel.crons.find(c => c.path === "/api/cron/booking-parity")?.schedule).toBe("45 5 * * *");
    expect(maxDuration).toBe(120);
    const actual = await vi.importActual<{ CRON_MAX_AGE_SECONDS: Record<string, number> }>("@/platform/infra/heartbeat");
    expect(actual.CRON_MAX_AGE_SECONDS["booking-parity"]).toBe(26 * 3600);
  });
  it("rejects missing authorization and missing configuration before any work", async () => {
    expect((await GET(request(false))).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(request())).status).toBe(500);
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.heartbeat).not.toHaveBeenCalled();
  });
  it("reads the authoritative tenant list and reports a completed batch", async () => {
    const select = vi.fn(async () => ({ data: [{ id: "one" }, { id: "two" }], error: null }));
    const from = vi.fn(() => ({ select }));
    mocks.db.mockReturnValue({ from });
    expect(await (await GET(request())).json()).toEqual(result);
    const options = mocks.run.mock.calls[0]![0];
    expect(options.deadlineMs).toBe(90_000);
    expect(await options.tenants()).toEqual(["one", "two"]);
    expect(from).toHaveBeenCalledWith("tenants");
    expect(select).toHaveBeenCalledWith("id");
    expect(mocks.heartbeat).toHaveBeenCalledWith("booking-parity", expect.objectContaining({ ok: true, processed: 2, failed: 0 }));
    expect(mocks.alert).not.toHaveBeenCalled();
  });
  it("list failures stay failures rather than an empty passing tenant list", async () => {
    await GET(request());
    const { tenants } = mocks.run.mock.calls[0]![0];
    mocks.db.mockReturnValue(null);
    await expect(tenants()).rejects.toThrow("tenant_list_unconfigured");
    mocks.db.mockReturnValue({ from: () => ({ select: async () => ({ data: null, error: {} }) }) });
    await expect(tenants()).rejects.toThrow("tenant_list_failed");
  });
  it("drift or incomplete runs alert and record an unhealthy heartbeat even when alerting fails", async () => {
    mocks.run.mockResolvedValue({ ...result, failed: 1, outOfParity: ["one"] });
    mocks.alert.mockRejectedValue(new Error("monitor unavailable"));
    expect((await GET(request())).status).toBe(200);
    expect(mocks.alert).toHaveBeenCalledWith("booking_parity", "high", { failed: 1, outOfParity: 1 }, 20 * 3600);
    expect(mocks.heartbeat).toHaveBeenCalledWith("booking-parity", expect.objectContaining({ ok: false, failed: 1 }));
  });
});
