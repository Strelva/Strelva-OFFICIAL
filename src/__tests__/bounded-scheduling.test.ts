import { describe, expect, it } from "vitest";
import { createSchedulingService } from "@/products/scheduling/server";
import { memoryBoundedStore, owner } from "./fixtures/bounded-store";

describe("scheduling commands", () => {
  it("reserves permitted time, rejects overlap and reopens an identical retry", async () => {
    const service = createSchedulingService(memoryBoundedStore(), { workspaceExitCompleted: async () => false });
    const schedule = await service.create(owner, "workspace-a", { title: "Consultations", availability: [{ start: "2026-09-20T09:00:00Z", end: "2026-09-20T12:00:00Z" }] });
    const command = { kind: "reserve", expectedRevision: 0, requestId: "request-1", title: "Roof inspection", start: "2026-09-20T09:00:00Z", end: "2026-09-20T10:00:00Z" };
    const booked = await service.command(owner, schedule.id, command);
    expect(booked.payload.reservations[0]!.status).toBe("reserved");
    expect((await service.command(owner, schedule.id, command)).payload.reservations).toHaveLength(1);
    await expect(service.command(owner, schedule.id, { ...command, requestId: "request-2", expectedRevision: 1, start: "2026-09-20T09:30:00Z" })).rejects.toThrow(/conflict/i);
  });
  it("reschedules the same reservation, preserves it on conflict, and reopens an identical retry", async () => {
    const service = createSchedulingService(memoryBoundedStore(), { workspaceExitCompleted: async () => false });
    const schedule = await service.create(owner, "workspace-a", { title: "Consultations", availability: [{ start: "2026-09-20T09:00:00Z", end: "2026-09-20T12:00:00Z" }] });
    const original = { kind: "reserve" as const, expectedRevision: 0, requestId: "request-1", title: "Roof inspection", start: "2026-09-20T09:00:00Z", end: "2026-09-20T10:00:00Z" };
    await service.command(owner, schedule.id, original);
    const moved = { kind: "reschedule" as const, expectedRevision: 1, requestId: original.requestId, start: "2026-09-20T10:00:00Z", end: "2026-09-20T11:00:00Z" };
    const rescheduled = await service.command(owner, schedule.id, moved);
    expect(rescheduled.payload.reservations).toEqual([{ requestId: "request-1", title: "Roof inspection", status: "reserved", start: moved.start, end: moved.end }]);
    expect((await service.command(owner, schedule.id, { ...moved, expectedRevision: 1 })).payload.reservations).toEqual(rescheduled.payload.reservations);
    await service.command(owner, schedule.id, { kind: "reserve", expectedRevision: 2, requestId: "request-2", title: "Roof delivery", start: "2026-09-20T11:00:00Z", end: "2026-09-20T12:00:00Z" });
    await expect(service.command(owner, schedule.id, { ...moved, expectedRevision: 3, start: "2026-09-20T10:30:00Z", end: "2026-09-20T11:30:00Z" })).rejects.toThrow(/conflict/i);
    await expect(service.command(owner, schedule.id, { ...moved, expectedRevision: 3, start: "2026-09-20T12:00:00Z", end: "2026-09-20T13:00:00Z" })).rejects.toThrow(/availability/i);
    const final = (await service.read(owner, schedule.id)).payload.reservations;
    expect(final).toHaveLength(2);
    expect(final.find(value => value.requestId === original.requestId)).toMatchObject({ start: moved.start, end: moved.end, status: "reserved" });
  });
  it("cancels a native reservation and reopens the same cancellation retry", async () => {
    const service = createSchedulingService(memoryBoundedStore(), { workspaceExitCompleted: async () => false });
    const schedule = await service.create(owner, "workspace-a", { title: "Consultations", availability: [{ start: "2026-09-20T09:00:00Z", end: "2026-09-20T12:00:00Z" }] });
    const reservation = { kind: "reserve" as const, expectedRevision: 0, requestId: "request-1", title: "Roof inspection", start: "2026-09-20T09:00:00Z", end: "2026-09-20T10:00:00Z" };
    await service.command(owner, schedule.id, reservation);
    const cancel = { kind: "cancel" as const, expectedRevision: 1, requestId: reservation.requestId };
    const cancelled = await service.command(owner, schedule.id, cancel);
    expect(cancelled.payload.reservations[0]!.status).toBe("cancelled");
    await expect(service.command(owner, schedule.id, { kind: "reschedule", expectedRevision: 1, requestId: reservation.requestId, start: "2026-09-20T10:00:00Z", end: "2026-09-20T11:00:00Z" })).rejects.toThrow(/cancelled reservation/i);
    const retried = await service.command(owner, schedule.id, cancel);
    expect(retried.payload.reservations[0]!.status).toBe("cancelled");
    expect(retried.payload.history).toHaveLength(2);
  });
  it("keeps provider-accepted reservations on the governed lifecycle", async () => {
    const service = createSchedulingService(memoryBoundedStore(), { workspaceExitCompleted: async () => false });
    const schedule = await service.create(owner, "workspace-a", { title: "Consultations", availability: [{ start: "2026-09-20T09:00:00Z", end: "2026-09-20T12:00:00Z" }] });
    await service.command(owner, schedule.id, { kind: "reserve", expectedRevision: 0, requestId: "request-1", title: "Roof inspection", start: "2026-09-20T09:00:00Z", end: "2026-09-20T10:00:00Z" });
    const provider = { authorize: async () => {}, reserve: async () => ({ providerId: "calendar-1" }), find: async () => ({ providerId: "calendar-1" }), verify: async () => true };
    const accepted = await service.deliver(owner, schedule.id, "request-1", provider);
    expect(accepted.payload.reservations[0]).toMatchObject({ status: "accepted", providerId: "calendar-1", verification: "verified" });
    await expect(service.command(owner, schedule.id, { kind: "reschedule", expectedRevision: accepted.payload.revision, requestId: "request-1", start: "2026-09-20T10:00:00Z", end: "2026-09-20T11:00:00Z" })).rejects.toThrow(/governed provider/i);
    expect((await service.read(owner, schedule.id)).payload.reservations[0]).toMatchObject({ status: "accepted", providerId: "calendar-1", verification: "verified", start: "2026-09-20T09:00:00Z", end: "2026-09-20T10:00:00Z" });
  });
  it("never sends twice after an accepted write with failed verification or an interrupted response", async () => {
    const service = createSchedulingService(memoryBoundedStore(), { workspaceExitCompleted: async () => false });
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
    const service = createSchedulingService(memoryBoundedStore(), { workspaceExitCompleted: async () => false });
    const schedule = await service.create(owner, "workspace-a", { title: "Visits", availability: [{ start: "2026-09-20T09:00:00Z", end: "2026-09-20T12:00:00Z" }] });
    await service.command(owner, schedule.id, { kind: "reserve", expectedRevision: 0, requestId: "r1", title: "Visit", start: "2026-09-20T09:00:00Z", end: "2026-09-20T10:00:00Z" });
    await expect(service.deliver(owner, schedule.id, "r1", { authorize: async () => { throw new Error("Approval revoked"); }, reserve: async () => { throw new Error("must not run"); }, find: async () => null, verify: async () => true })).rejects.toThrow("Approval revoked");
    expect((await service.read(owner, schedule.id)).payload.reservations[0]!.status).toBe("reserved");
  });

  it("does not admit a new reservation after the workspace exit decision", async () => {
    const service = createSchedulingService(memoryBoundedStore(), { workspaceExitCompleted: async () => true });
    const schedule = await service.create(owner, "workspace-a", { title: "Visits", availability: [{ start: "2026-09-20T09:00:00Z", end: "2026-09-20T12:00:00Z" }] });
    await expect(service.command(owner, schedule.id, { kind: "reserve", expectedRevision: 0, requestId: "exit-r1", title: "Visit", start: "2026-09-20T09:00:00Z", end: "2026-09-20T10:00:00Z" })).rejects.toThrow(/stopped for this workspace/i);
  });

  it("does not reschedule an existing local reservation after the workspace exit decision", async () => {
    const store = memoryBoundedStore();
    const setup = createSchedulingService(store, { workspaceExitCompleted: async () => false });
    const schedule = await setup.create(owner, "workspace-a", { title: "Visits", availability: [{ start: "2026-09-20T09:00:00Z", end: "2026-09-20T12:00:00Z" }] });
    await setup.command(owner, schedule.id, { kind: "reserve", expectedRevision: 0, requestId: "exit-r1", title: "Visit", start: "2026-09-20T09:00:00Z", end: "2026-09-20T10:00:00Z" });
    const service = createSchedulingService(store, { workspaceExitCompleted: async () => true });
    await expect(service.command(owner, schedule.id, { kind: "reschedule", expectedRevision: 1, requestId: "exit-r1", start: "2026-09-20T10:00:00Z", end: "2026-09-20T11:00:00Z" })).rejects.toThrow(/stopped for this workspace/i);
    expect((await service.read(owner, schedule.id)).payload.reservations[0]).toMatchObject({ status: "reserved", start: "2026-09-20T09:00:00Z" });
  });

});
