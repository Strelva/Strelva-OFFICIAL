import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  release: vi.fn(),
  sweep: vi.fn(),
  heartbeat: vi.fn(),
}));

vi.mock("@/lib/cron-auth", () => ({ requireCronRequest: mocks.auth }));
vi.mock("@/lib/heartbeat", () => ({ recordHeartbeat: mocks.heartbeat }));
vi.mock("@/products/inquiries/server", () => ({ inquiryReleaseEnabled: mocks.release }));
vi.mock("@/products/inquiries", () => ({ runDueInquiryFollowUps: mocks.sweep }));

import { GET } from "@/app/api/cron/inquiry-follow-ups/route";

describe("inquiry follow-up cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps cron auth in front of the sweep", async () => {
    const denied = new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    mocks.auth.mockReturnValue(denied);
    const response = await GET(new Request("https://app.strelva.test/api/cron/inquiry-follow-ups"));
    expect(response).toBe(denied);
    expect(mocks.sweep).not.toHaveBeenCalled();
  });

  it("records a heartbeat and exposes blocked due work without sending itself", async () => {
    mocks.auth.mockReturnValue(null);
    mocks.release.mockReturnValue(true);
    mocks.sweep.mockResolvedValue({
      tenantsChecked: 1,
      candidates: 1,
      due: 1,
      attempted: 1,
      accepted: 0,
      blocked: 1,
      failed: 0,
      results: [{ inquiryId: "lead-1", tenantId: "acme", action: "schedule_follow_up", status: "paused", reason: "fresh_no_reply_check_required", retryable: false }],
    });
    const response = await GET(new Request("https://app.strelva.test/api/cron/inquiry-follow-ups"));
    expect(response.status).toBe(200);
    expect(mocks.sweep).toHaveBeenCalledTimes(1);
    expect(mocks.heartbeat).toHaveBeenCalledWith("inquiry-follow-ups", { ok: true, processed: 1, failed: 0 });
    expect(await response.json()).toMatchObject({ attempted: 1, blocked: 1 });
  });

  it("does not run while the inquiry release gate is off", async () => {
    mocks.auth.mockReturnValue(null);
    mocks.release.mockReturnValue(false);
    const response = await GET(new Request("https://app.strelva.test/api/cron/inquiry-follow-ups"));
    expect(response.status).toBe(200);
    expect(mocks.sweep).not.toHaveBeenCalled();
    expect(mocks.heartbeat).toHaveBeenCalledWith("inquiry-follow-ups", { ok: true, processed: 0 });
  });
});
