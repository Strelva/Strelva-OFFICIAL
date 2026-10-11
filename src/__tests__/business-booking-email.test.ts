import { describe, expect, it, vi } from "vitest";
import { businessBookingEmailEnabled, setBusinessBookingEmail } from "@/platform/bookings/email-enablement";
const workspaceId = "ab000000-0000-4000-8000-000000000010";
const actor = { userId: "ab000000-0000-4000-8000-000000000001", verifiedEmail: "operator@example.test" };
describe("logged native booking email switch", () => {
  it.each(["inherit", "off", null, "malformed"])("%s cannot enable delivery", async state => {
    expect(await businessBookingEmailEnabled(workspaceId, { rpc: async () => ({ data: state, error: null }) })).toBe(false);
  });
  it("only explicit on arms the business; unavailable storage fails closed", async () => {
    expect(await businessBookingEmailEnabled(workspaceId, { rpc: async () => ({ data: "on", error: null }) })).toBe(true);
    expect(await businessBookingEmailEnabled(workspaceId, null)).toBe(false);
    expect(await businessBookingEmailEnabled(workspaceId, { rpc: async () => ({ data: "on", error: {} }) })).toBe(false);
  });
  it("records the session actor and reason through the atomic command", async () => {
    const rpc = vi.fn(async () => ({ data: { state: "on", eventId: "ab000000-0000-4000-8000-000000000099", actorId: actor.userId }, error: null }));
    expect(await setBusinessBookingEmail(actor, workspaceId, "on", "Fictional test business", { rpc })).toMatchObject({ state: "on", actorId: actor.userId });
    expect(rpc).toHaveBeenCalledWith("set_business_booking_email", { p_workspace_id: workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_state: "on", p_reason: "Fictional test business" });
    await expect(setBusinessBookingEmail(actor, workspaceId, "on", "", { rpc })).rejects.toThrow();
    expect(rpc).toHaveBeenCalledOnce();
    await expect(setBusinessBookingEmail(actor, workspaceId, "on", "Arm", { rpc: async () => ({ data: null, error: {} }) })).rejects.toThrow("could not be confirmed");
  });
});
