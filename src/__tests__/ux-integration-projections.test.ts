import { describe, expect, it, vi } from "vitest";
import { withAgencyPreview } from "@/experience/workspace/preview/agency-fixture";
import { handledFromStore } from "@/platform/needs-you/handled";
import { ownerDecisionSchema } from "@/platform/needs-you/contracts";
import { recordedActorSchema } from "@/platform/presentation/actor";
import { bookingRequestAdapter } from "@/platform/bookings/needs-you-adapter";

const agency = { kind: "agency" as const, agencyId: "d2950000-0000-4000-8000-0000000000a2", userId: "d2950000-0000-4000-8000-000000000001", displayName: "Recorded Studio" };
describe("cross-lane agency integration", () => {
  it("retains the complete recorded agency decision identity", () => {
    expect(recordedActorSchema.parse(agency)).toEqual(agency);
    expect(ownerDecisionSchema.shape.decidedActor.parse(agency)).toEqual(agency);
    expect(ownerDecisionSchema.shape.decidedActor.parse(null)).toBeNull();
  });
  it("attributes a completed decision to its decider separately from its proposer", () => {
    const receipt = handledFromStore({ store: "owner_decisions", id: "decision", at: "2026-10-12T12:00:00Z", title: "Booking request: Sam", sourceLifecycle: "booking_request", state: "approved", outcome: "done", decidedByKind: "agency_session", actor: { kind: "agency", displayName: "Proposing Studio" }, decidedActor: agency });
    expect(receipt?.actor).toEqual(agency);
    expect(receipt?.sentence).toContain("Recorded Studio confirmed the booking");
    expect(receipt?.sentence).not.toContain("Proposing Studio");
    expect(handledFromStore({ store: "owner_decisions", id: "decision", at: "2026-10-12T12:00:00Z", state: "approved", outcome: "done", decidedByKind: "agency_session", actor: agency })?.actor).toBeUndefined();
  });
  it.each(["approved", "declined"])("does not attribute a pre-existing booking outcome to an agency's %s decision", state => {
    const receipt = handledFromStore({ store: "owner_decisions", id: "decision", at: "2026-10-12T12:00:00Z", title: "Booking request: Sam", sourceLifecycle: "booking_request", state, outcome: "done", outcomeReason: "already_resolved", decidedByKind: "agency_session", decidedActor: agency });
    expect(receipt?.sentence).toBe("The booking request was already resolved. This decision made no new change.");
    expect(receipt?.changed).toBeNull();
  });
  it("uses the exact claimed decision for agency booking execution and fails closed without it", async () => {
    const decide = vi.fn(); const decideAgency = vi.fn(async () => ({ status: "already_decided" as const, booking: {} as never }));
    const item = { id: "decision", sourceId: "booking", decidedByKind: "agency_session" } as never;
    await bookingRequestAdapter({ requests: async () => [], decide, decideAgency }).resolve({ workspaceId: "business" }, item, "approve", { kind: "expiry" });
    expect(decideAgency).toHaveBeenCalledWith("business", "booking", "not_yet", "decision");
    expect(decide).not.toHaveBeenCalled();
    expect(await bookingRequestAdapter({ requests: async () => [], decide }).resolve({ workspaceId: "business" }, item, "approve", { kind: "expiry" })).toEqual({ outcome: "failed", reason: "agency_booking_identity_unavailable" });
  });
  it("fixture Library carries each exact qualified offer and local change count", async () => {
    const base = vi.fn(); const request = withAgencyPreview(base, "agency-systems", "full");
    const result = await (await request("/api/workspace/agency-library?workspaceId=agency")).json();
    expect(result.sources[0].versions[0]).toMatchObject({ improvementRevision: 4, localChanges: 1 });
    expect(result.sources[1].versions).toEqual([expect.objectContaining({ improvementRevision: null }), expect.objectContaining({ improvementRevision: 2 })]);
    expect(base).not.toHaveBeenCalled();
  });
  it("fixture brand reads, saves and reads the saved value without external transport", async () => {
    const base = vi.fn(); const request = withAgencyPreview(base, "agency-systems", "full");
    const initial = await (await request("/api/workspace/agency-brand?workspaceId=agency")).json();
    const brand = { ...initial.brand, displayName: "Changed Studio" };
    await request("/api/workspace/agency-brand", { method: "PUT", body: JSON.stringify({ workspaceId: "agency", brand }) });
    expect(await (await request("/api/workspace/agency-brand?workspaceId=agency")).json()).toEqual({ brand });
    expect(base).not.toHaveBeenCalled();
  });
});
