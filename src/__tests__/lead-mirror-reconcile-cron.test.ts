import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reconcile: vi.fn(),
  heartbeat: vi.fn(),
  alertOnce: vi.fn(),
  denied: vi.fn(),
  purge: vi.fn(),
}));
vi.mock("@/lib/client-leads", () => ({ reconcileLeadMirror: mocks.reconcile }));
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

  it("missing tenant_leads schema: one state in the response, no hourly backlog page, heartbeat stays healthy", async () => {
    mocks.reconcile.mockResolvedValue({ checked: 0, repaired: 0, failed: 0, missing: 0, remaining: 40, schemaMissing: true });
    const res = await GET(new Request("http://localhost/api/cron/lead-mirror-reconcile"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ schemaMissing: true, remaining: 40 });
    expect(mocks.alertOnce).not.toHaveBeenCalledWith("lead_mirror_backlog", expect.anything(), expect.anything(), expect.anything());
    expect(mocks.heartbeat).toHaveBeenCalledWith("lead-mirror-reconcile", { ok: true, processed: 0, failed: 0 });
  });

  it("missing schema still pages for leads that left Redis before they were copied", async () => {
    mocks.reconcile.mockResolvedValue({ checked: 1, repaired: 0, failed: 0, missing: 1, remaining: 40, schemaMissing: true });
    await GET(new Request("http://localhost/api/cron/lead-mirror-reconcile"));
    expect(mocks.alertOnce).toHaveBeenCalledWith("lead_mirror_backlog", "high", { remaining: 40, missing: 1, failed: 0 }, 6 * 3600);
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
