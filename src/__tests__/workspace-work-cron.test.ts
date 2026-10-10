import { beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  release: true,
  heartbeat: vi.fn(async () => undefined),
  listDueWork: vi.fn(async () => []),
  snapshotMeters: vi.fn(async () => ({ processed: 1, failed: 0, failures: [] })),
  sweepDueWork: vi.fn(async () => ({ processed: 2, failed: 0, remaining: 0, failures: [] })),
  listDueActivations: vi.fn(async () => [{ workspaceId: "w", activationId: "a", actor: { userId: "u", verifiedEmail: "o@x.test" } }]),
  resumeDue: vi.fn(async () => ({ processed: 1, failed: 0, results: [{ activationId: "a", status: "made_real" }] })),
  withdrawIdle: vi.fn(async () => [{ workspaceId: "w", possibilityId: "p", title: "Old idea" }]),
}));

vi.mock("@/lib/cron-auth", () => ({ requireCronRequest: () => null }));
vi.mock("@/platform/infra/heartbeat", () => ({ recordHeartbeat: boundary.heartbeat }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => boundary.release }));
vi.mock("@/products/operations/server", () => ({ listDueWork: boundary.listDueWork, sweepDueWork: boundary.sweepDueWork, snapshotDueResponsibilityMeters: boundary.snapshotMeters }));
vi.mock("@/experience/systems/live-server", () => ({ listDueActivations: boundary.listDueActivations, liveMakeReal: { resumeDue: boundary.resumeDue } }));
vi.mock("@/platform/possibilities/supabase-repository", () => ({ withdrawIdlePossibilities: boundary.withdrawIdle }));

import { GET } from "@/app/api/cron/workspace-work/route";

describe("workspace-work cron: Make real resume and idle withdraw", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    boundary.snapshotMeters.mockResolvedValue({ processed: 1, failed: 0, failures: [] });
    boundary.release = true;
    vi.stubEnv("STRELVA_BACKGROUND_WORK_RELEASE", "1");
  });

  it("does nothing while the workspace release is off", async () => {
    boundary.release = false;
    const body = await (await GET(new Request("https://app.test/api/cron/workspace-work"))).json();
    expect(body).toEqual({ status: "disabled" });
    expect(boundary.resumeDue).not.toHaveBeenCalled();
    expect(boundary.snapshotMeters).not.toHaveBeenCalled();
  });

  it("resumes due activations and withdraws idle possibilities before the work sweep", async () => {
    const body = await (await GET(new Request("https://app.test/api/cron/workspace-work"))).json();
    expect(boundary.resumeDue).toHaveBeenCalledWith(await boundary.listDueActivations.mock.results[0]!.value, 15_000);
    expect(boundary.withdrawIdle).toHaveBeenCalledWith({ idleDays: 90, limit: 100 });
    expect(boundary.snapshotMeters).toHaveBeenCalledWith(20);
    expect(body.responsibilityMeter).toMatchObject({ processed: 1, failed: 0 });
    expect(body).toMatchObject({ processed: 2, systems: { activations: { processed: 1, failed: 0 }, withdrawn: 1 } });
    expect(boundary.heartbeat).toHaveBeenCalledWith("workspace-work", { ok: true, processed: 3, failed: 0 });
  });

  it("keeps settling running activations even when new standing work is off", async () => {
    vi.stubEnv("STRELVA_BACKGROUND_WORK_RELEASE", "0");
    const body = await (await GET(new Request("https://app.test/api/cron/workspace-work"))).json();
    expect(boundary.resumeDue).toHaveBeenCalled();
    expect(boundary.sweepDueWork).not.toHaveBeenCalled();
    expect(boundary.snapshotMeters).not.toHaveBeenCalled();
    expect(body).toMatchObject({ status: "disabled", systems: { activations: { processed: 1 } } });
  });

  it("reports a Make real failure without blocking the sweep", async () => {
    boundary.listDueActivations.mockRejectedValueOnce(new Error("Due activations could not be read."));
    const body = await (await GET(new Request("https://app.test/api/cron/workspace-work"))).json();
    expect(boundary.sweepDueWork).toHaveBeenCalled();
    expect(body.systems).toMatchObject({ activations: { failed: 1 }, error: "Due activations could not be read." });
    expect(boundary.heartbeat).toHaveBeenCalledWith("workspace-work", { ok: false, processed: 2, failed: 1 });
  });
  it("preserves work results but reports an unavailable responsibility meter", async () => {
    boundary.snapshotMeters.mockRejectedValueOnce(new Error("meter unavailable"));
    const response = await GET(new Request("https://app.test/api/cron/workspace-work"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ processed: 2, responsibilityMeter: { processed: 0, failed: 1 } });
    expect(boundary.heartbeat).toHaveBeenCalledWith("workspace-work", { ok: false, processed: 3, failed: 1 });
  });

});
