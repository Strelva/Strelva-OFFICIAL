import { describe, expect, it } from "vitest";
import { createDocument, changeDocument, DOCUMENT_RECENT_HISTORY } from "@/products/documents/engine";

describe("private workspace documents", () => {
  it("keeps one receipt for a saved revision and restores it through Undo", () => {
    const original = createDocument({ title: "Customer handoff", text: "Confirm the next appointment." }, "owner");
    const revised = changeDocument(original, { kind: "edit", expectedRevision: 0, title: original.title, text: "Confirm the appointment and responsible person." }, "owner");
    expect(revised.history).toHaveLength(1);
    expect(revised.history[0]!.before.text).toBe("Confirm the next appointment.");
    const undone = changeDocument(revised, { kind: "undo", expectedRevision: 1, targetRevision: 1 }, "owner");
    expect(undone.text).toBe(original.text);
    expect(undone.revision).toBe(2);
    expect(undone.history).toHaveLength(2);
  });
  it("refuses stale changes and an Undo that would overwrite later work", () => {
    const original = createDocument({ title: "Procedure", text: "First version" }, "owner");
    const one = changeDocument(original, { kind: "edit", expectedRevision: 0, title: original.title, text: "Second version" }, "owner");
    const two = changeDocument(one, { kind: "edit", expectedRevision: 1, title: original.title, text: "Third version" }, "owner");
    expect(() => changeDocument(two, { kind: "edit", expectedRevision: 1, title: original.title, text: "Stale overwrite" }, "owner")).toThrow();
    expect(() => changeDocument(two, { kind: "undo", expectedRevision: 2, targetRevision: 1 }, "owner")).toThrow();
    expect(two.text).toBe("Third version");
  });
  it("takes edit 201 and beyond, and Undo still restores the latest edit", () => {
    // Baseline before the fix (2026-10-06): edit 201 threw a ZodError because
    // the payload kept every receipt, capped at 200, so the document was stuck.
    let doc = createDocument({ title: "Long-lived procedure", text: "v0" }, "owner");
    for (let i = 1; i <= 1000; i += 1) {
      doc = changeDocument(doc, { kind: "edit", expectedRevision: i - 1, title: doc.title, text: `v${i}` }, "owner");
      if (i === 201) expect(doc.text).toBe("v201");
    }
    expect(doc.revision).toBe(1000);
    expect(doc.history).toHaveLength(DOCUMENT_RECENT_HISTORY);
    expect(doc.history.at(-1)!.revision).toBe(1000);
    expect(doc.history[0]!.revision).toBe(1000 - DOCUMENT_RECENT_HISTORY + 1);
    const undone = changeDocument(doc, { kind: "undo", expectedRevision: 1000, targetRevision: 1000 }, "owner");
    expect(undone.text).toBe("v999");
    expect(undone.revision).toBe(1001);
    expect(undone.history).toHaveLength(DOCUMENT_RECENT_HISTORY);
    expect(undone.history.at(-1)).toMatchObject({ kind: "undo", undoesRevision: 1000 });
    expect(() => changeDocument(undone, { kind: "undo", expectedRevision: 1001, targetRevision: 1000 }, "owner")).toThrow();
  });
  it("still reads a payload written before the window with up to 200 receipts", () => {
    let doc = createDocument({ title: "Legacy", text: "v0" }, "owner");
    const legacyHistory = Array.from({ length: 200 }, (_, index) => ({
      revision: index + 1, actorId: "owner", at: new Date().toISOString(), kind: "edit" as const,
      before: { title: "Legacy", text: `v${index}` }, after: { title: "Legacy", text: `v${index + 1}` },
    }));
    doc = { ...doc, text: "v200", revision: 200, history: legacyHistory };
    const next = changeDocument(doc, { kind: "edit", expectedRevision: 200, title: "Legacy", text: "v201" }, "owner");
    expect(next.revision).toBe(201);
    expect(next.history).toHaveLength(DOCUMENT_RECENT_HISTORY);
    expect(next.history.at(-1)!.revision).toBe(201);
    let continued = next;
    for (let revision = 202; revision <= 450; revision += 1) {
      continued = changeDocument(continued, { kind: "edit", expectedRevision: revision - 1, title: "Legacy", text: `v${revision}` }, "owner");
    }
    expect(continued.revision).toBe(450);
    expect(continued.history).toHaveLength(DOCUMENT_RECENT_HISTORY);
    expect(changeDocument(continued, { kind: "undo", expectedRevision: 450, targetRevision: 450 }, "owner").text).toBe("v449");
  });
});
