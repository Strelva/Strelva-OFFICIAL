import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ enabled: vi.fn(), send: vi.fn(), auth: vi.fn(), heartbeat: vi.fn() }));
vi.mock("@/products/publishing/server", () => ({ newsletterSenderEnabled: state.enabled, sendApprovedNewsletterIssues: state.send }));
vi.mock("@/lib/cron-auth", () => ({ requireCronRequest: state.auth }));
vi.mock("@/platform/infra/heartbeat", () => ({ recordHeartbeat: state.heartbeat }));
import { GET } from "@/app/api/cron/newsletter-sender/route";
beforeEach(() => { vi.clearAllMocks(); state.auth.mockReturnValue(null); state.enabled.mockReturnValue(true); state.send.mockResolvedValue({ accepted: 2, gated: 1, suppressed: 0, unknown: 0, failed: 0 }); });
it("requires cron authorization before touching delivery storage", async () => {
  state.auth.mockReturnValue(new Response("Denied", { status: 401 })); expect((await GET(new Request("http://localhost/api/cron/newsletter-sender"))).status).toBe(401);
  expect(state.enabled).not.toHaveBeenCalled(); expect(state.send).not.toHaveBeenCalled();
});
it("records a healthy no-op heartbeat while release is off", async () => {
  state.enabled.mockReturnValue(false); const response = await GET(new Request("http://localhost/api/cron/newsletter-sender"));
  expect(await response.json()).toEqual({ status: "disabled" }); expect(state.send).not.toHaveBeenCalled();
  expect(state.heartbeat).toHaveBeenCalledWith("newsletter-sender", { ok: true, processed: 0 });
});
it("reports uncertain batches as unhealthy without claiming delivery", async () => {
  state.send.mockResolvedValue({ accepted: 1, gated: 0, suppressed: 0, unknown: 1, failed: 1 });
  const response = await GET(new Request("http://localhost/api/cron/newsletter-sender")); expect(response.status).toBe(200);
  expect(state.heartbeat).toHaveBeenCalledWith("newsletter-sender", { ok: false, processed: 1, failed: 2 });
});
it("records storage failures without a success response", async () => {
  state.send.mockRejectedValue(new Error("database unavailable")); expect((await GET(new Request("http://localhost/api/cron/newsletter-sender"))).status).toBe(500);
  expect(state.heartbeat).toHaveBeenCalledWith("newsletter-sender", { ok: false, failed: 1 });
});
