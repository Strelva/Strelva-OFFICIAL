const admission = vi.hoisted(() => vi.fn(async () => undefined));
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/platform/operator-read-audit/admission", () => ({ authorizeAdminOperatorRead: admission }));
const m = vi.hoisted(() => ({ admin: vi.fn(), actor: vi.fn(), set: vi.fn(), history: vi.fn(), enabled: vi.fn() }));
vi.mock("@/platform/infra/auth", () => ({ isSuperAdmin: m.admin }));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: m.actor }));
vi.mock("@/platform/bookings/email-enablement", () => ({ setBusinessBookingEmail: m.set, readBusinessBookingEmailHistory: m.history, businessBookingEmailEnabled: m.enabled }));
import { WorkspaceAccessError } from "@/platform/workspaces/types";
import { GET, POST } from "@/app/api/admin/businesses/[id]/booking-email/route";
const id = "af200000-0000-4000-8000-000000000010";
const params = { params: Promise.resolve({ id }) };
const request = (body: unknown, origin = "https://app.example.test") => new Request(`https://app.example.test/api/admin/businesses/${id}/booking-email`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => { vi.resetAllMocks(); m.admin.mockResolvedValue(true); m.actor.mockResolvedValue({ id: "af200000-0000-4000-8000-000000000001", email: "operator@example.test", email_confirmed_at: "now" }); m.set.mockResolvedValue({ state: "on", eventId: "receipt", actorId: "operator" }); m.history.mockResolvedValue([]); m.enabled.mockResolvedValue(false); });
describe("per-business booking email operator route", () => {
  it("rejects cross-origin, non-operator and invalid input without changing a switch", async () => {
    expect((await POST(request({ state: "on", reason: "Arm" }, "https://elsewhere.test"), params)).status).toBe(403);
    m.admin.mockResolvedValue(false);
    expect((await POST(request({ state: "on", reason: "Arm" }), params)).status).toBe(403);
    m.admin.mockResolvedValue(true);
    expect((await POST(request({ state: "on", reason: "" }), params)).status).toBe(400);
    expect((await POST(request({ state: "on", reason: "Arm", actorId: "forged" }), params)).status).toBe(400);
    expect(m.set).not.toHaveBeenCalled();
  });
  it("writes the trusted session actor and exposes logged history", async () => {
    expect((await POST(request({ state: "on", reason: "Fictional business" }), params)).status).toBe(200);
    expect(m.set).toHaveBeenCalledWith({ userId: "af200000-0000-4000-8000-000000000001", verifiedEmail: "operator@example.test" }, id, "on", "Fictional business");
    expect(await (await GET(request({}), params)).json()).toEqual({ enabled: false, history: [] });
  });
  it("storage failure reports unconfirmed rather than enabled", async () => {
    m.set.mockRejectedValue(new Error("Persistence unavailable"));
    expect((await POST(request({ state: "on", reason: "Arm" }), params)).status).toBe(503);
  });
});

it("preserves GET refusal envelopes and never reads booking enablement/history without admission", async () => {
  admission.mockRejectedValueOnce(new WorkspaceAccessError()); expect((await GET(request({}), params)).status).toBe(403);
  admission.mockRejectedValueOnce(new Error("audit unavailable")); expect((await GET(request({}), params)).status).toBe(503); expect(m.history).not.toHaveBeenCalled(); expect(m.enabled).not.toHaveBeenCalled();
});
