import { describe, expect, it } from "vitest";
import { createPreviewInquiryAdapter } from "@/experience/inquiries/preview-fixture";

describe("isolated inquiry journey", () => {
  it("uses real transitions for shape, edits, rehearsal, publication, inquiry and grouped undo", async () => {
    const adapter = createPreviewInquiryAdapter();
    const actorId = "fixture-owner";
    const requestId = adapter.getSnapshot().state.requests[0]!.id;
    expect(adapter.getSnapshot().state.requests[0]!.draft).toBeNull();
    await adapter.execute({ kind: "accept-shape", requestId, input: { actorId } });
    await adapter.execute({ kind: "edit", requestId, input: { actorId, source: "manual", path: "form.title", after: "Tell us about your home" } });
    await adapter.execute({ kind: "edit", requestId, input: { actorId, source: "words", path: "form.intro", after: "Maria can help with your next move." } });
    const rehearsed = await adapter.execute({ kind: "rehearse", requestId, actorId });
    expect(rehearsed.rehearsal?.passed).toBe(true);
    const published = await adapter.execute({ kind: "publish", requestId, actorId });
    expect(published.work?.state).toBe("handled");
    expect(published.change?.items.flatMap((item) => item.sources)).toEqual(expect.arrayContaining(["manual", "words"]));
    const capabilityId = published.work!.capabilityId;
    const submit = () => adapter.execute({ kind: "simulate-inquiry", capabilityId, actorId, fields: { name: "Pretend customer", email: "pretend@example.invalid", message: "Please help me sell my home." } });
    const first = await submit();
    expect(first.record?.timelineEventIds.length).toBeGreaterThanOrEqual(2);
    const recordIds = [first.record!.id];
    await adapter.execute({ kind: "bulk-record", recordIds, action: "mark_handled", actorId });
    const second = await submit();
    await adapter.execute({ kind: "bulk-undo", recordIds, actorId });
    const snapshot = adapter.getSnapshot();
    expect(snapshot.state.inquiries.find((record) => record.id === first.record!.id)?.status).toBe(first.record!.status);
    expect(snapshot.state.inquiries.some((record) => record.id === second.record!.id)).toBe(true);
    await adapter.execute({ kind: "undo", requestId, actorId });
    expect(adapter.getSnapshot().state.inquiries).toHaveLength(2);
    expect(adapter.getSnapshot().rehearsal).toBe(true);
  });

  it("does not fabricate records or mutate a read-only or unavailable preview", async () => {
    for (const scenario of ["read-only", "unavailable"]) {
      const adapter = createPreviewInquiryAdapter("business", scenario);
      expect(adapter.getSnapshot().state.inquiries).toEqual([]);
      await expect(adapter.execute({ kind: "start", input: { actorId: "fixture-owner", intent: "A seller form" } })).rejects.toThrow();
    }
  });
});
