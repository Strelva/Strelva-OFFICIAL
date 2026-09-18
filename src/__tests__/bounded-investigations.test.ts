import { describe, expect, it } from "vitest";
import { createInvestigationService } from "@/products/investigations/server";
import { memoryBoundedStore, owner } from "./fixtures/bounded-store";
import { createDocument } from "@/products/documents/contracts";

describe("ongoing investigation commands", () => {
  it("compares two authorized versioned sources, reports discrepancy then no change on a repeated run", async () => {
    const store = memoryBoundedStore();
    const left = await store.create(owner, "workspace-a", { productId: "documents", resourceKind: "document", payload: createDocument({ title: "Policy", text: "Tuesday" }, owner.userId) });
    const right = await store.create(owner, "workspace-a", { productId: "documents", resourceKind: "document", payload: createDocument({ title: "Website copy", text: "Wednesday" }, owner.userId) });
    const service = createInvestigationService(store);
    const work = await service.create(owner, "workspace-a", { title: "Opening day agreement", intervalMinutes: 60, sources: [{ workId: left.id }, { workId: right.id }] });
    const first = await service.run(owner, work.id, { expectedRevision: 0, requestId: "run-1" });
    expect(first.payload.runs[0]).toMatchObject({ result: "discrepancy", differences: [{ key: "document", left: "Tuesday", right: "Wednesday" }] });
    expect(first.payload.runs[0]!.sources.map(source => source.revision)).toEqual([0, 0]);
    const nextTime = new Date(Date.now() + 61 * 60000);
    const repeated = await service.run(owner, work.id, { expectedRevision: 1, requestId: "run-2" }, nextTime);
    expect(repeated.payload.runs[1]).toMatchObject({ result: "no_change", differences: [{ key: "document", left: "Tuesday", right: "Wednesday" }] });
  });
  it("does not run paused or prematurely and rejects missing source access", async () => {
    const store = memoryBoundedStore();
    const doc = (text: string) => createDocument({ title: "Hours", text }, owner.userId);
    const a = await store.create(owner, "workspace-a", { productId: "documents", resourceKind: "document", payload: doc("Monday") });
    const b = await store.create(owner, "workspace-a", { productId: "documents", resourceKind: "document", payload: doc("Monday") });
    const service = createInvestigationService(store);
    await expect(service.create(owner, "workspace-a", { title: "Hours", intervalMinutes: 60, sources: [{ workId: a.id }, { workId: "11111111-1111-4111-8111-111111111111" }] })).rejects.toThrow(/unavailable/i);
    const work = await service.create(owner, "workspace-a", { title: "Hours", intervalMinutes: 60, sources: [{ workId: a.id }, { workId: b.id }] });
    const first = await service.run(owner, work.id, { expectedRevision: 0, requestId: "first" });
    expect(first.payload.runs[0]!.result).toBe("agreement");
    await expect(service.run(owner, work.id, { expectedRevision: 1, requestId: "early" })).rejects.toThrow(/not due/i);
    await service.command(owner, work.id, { kind: "pause", expectedRevision: 1 });
    await expect(service.run(owner, work.id, { expectedRevision: 2, requestId: "paused" }, new Date(Date.now() + 3600001))).rejects.toThrow(/paused/i);
    expect((await service.read(owner, work.id)).payload.runs).toHaveLength(1);
  });

});
