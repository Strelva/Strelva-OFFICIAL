import { describe, expect, it } from "vitest";
import { createSchedulingService } from "@/products/scheduling/server";
import { memoryBoundedStore, owner } from "./fixtures/bounded-store";

describe("scheduling commands", () => {
  it("reserves permitted time, rejects overlap and reopens an identical retry", async () => {
    const service = createSchedulingService(memoryBoundedStore());
    const schedule = await service.create(owner, "workspace-a", { title: "Consultations", availability: [{ start: "2026-09-20T09:00:00Z", end: "2026-09-20T12:00:00Z" }] });
    const command = { kind: "reserve", expectedRevision: 0, requestId: "request-1", title: "Roof inspection", start: "2026-09-20T09:00:00Z", end: "2026-09-20T10:00:00Z" };
    const booked = await service.command(owner, schedule.id, command);
    expect(booked.payload.reservations[0]!.status).toBe("reserved");
    expect((await service.command(owner, schedule.id, command)).payload.reservations).toHaveLength(1);
    await expect(service.command(owner, schedule.id, { ...command, requestId: "request-2", expectedRevision: 1, start: "2026-09-20T09:30:00Z" })).rejects.toThrow(/conflict/i);
  });
  it("never sends twice after an accepted write with failed verification or an interrupted response", async () => {
    const service = createSchedulingService(memoryBoundedStore());
    const schedule = await service.create(owner, "workspace-a", { title: "Visits", availability: [{ start: "2026-09-20T09:00:00Z", end: "2026-09-20T12:00:00Z" }] });
    await service.command(owner, schedule.id, { kind: "reserve", expectedRevision: 0, requestId: "r1", title: "Visit", start: "2026-09-20T09:00:00Z", end: "2026-09-20T10:00:00Z" });
    const externalBookings: string[] = [];
    const provider = { authorize: async () => {}, reserve: async () => { externalBookings.push("booking-1"); throw new Error("response lost"); }, find: async () => ({ providerId: "booking-1" }), verify: async () => { throw new Error("offline"); } };
    expect((await service.deliver(owner, schedule.id, "r1", provider)).payload.reservations[0]!.status).toBe("unknown");
    const recovered = await service.deliver(owner, schedule.id, "r1", provider);
    expect(recovered.payload.reservations[0]).toMatchObject({ status: "accepted", providerId: "booking-1", verification: "failed" });
    await service.deliver(owner, schedule.id, "r1", provider);
    expect(externalBookings).toEqual(["booking-1"]);
  });
  it("revoked provider authority prevents the external reservation", async () => {
    const service = createSchedulingService(memoryBoundedStore());
    const schedule = await service.create(owner, "workspace-a", { title: "Visits", availability: [{ start: "2026-09-20T09:00:00Z", end: "2026-09-20T12:00:00Z" }] });
    await service.command(owner, schedule.id, { kind: "reserve", expectedRevision: 0, requestId: "r1", title: "Visit", start: "2026-09-20T09:00:00Z", end: "2026-09-20T10:00:00Z" });
    await expect(service.deliver(owner, schedule.id, "r1", { authorize: async () => { throw new Error("Approval revoked"); }, reserve: async () => { throw new Error("must not run"); }, find: async () => null, verify: async () => true })).rejects.toThrow("Approval revoked");
    expect((await service.read(owner, schedule.id)).payload.reservations[0]!.status).toBe("reserved");
  });

});
