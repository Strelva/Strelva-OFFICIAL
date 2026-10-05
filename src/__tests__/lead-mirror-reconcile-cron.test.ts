import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reconcile: vi.fn(),
  heartbeat: vi.fn(),
  alertOnce: vi.fn(),
  denied: vi.fn(),
}));
vi.mock("@/lib/client-leads", () => ({ reconcileLeadMirror: mocks.reconcile }));
vi.mock("@/lib/heartbeat", () => ({ recordHeartbeat: mocks.heartbeat }));
vi.mock("@/lib/monitoring", () => ({ alertOnce: mocks.alertOnce }));
vi.mock("@/lib/cron-auth", () => ({ requireCronRequest: mocks.denied }));

import { GET } from "@/app/api/cron/lead-mirror-reconcile/route";
import vercel from "../../vercel.json";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.denied.mockReturnValue(null);
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
});
