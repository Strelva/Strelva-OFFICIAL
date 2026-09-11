import { describe, expect, it } from "vitest";
import { createDocument, changeDocument } from "@/products/documents/engine";

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
});
