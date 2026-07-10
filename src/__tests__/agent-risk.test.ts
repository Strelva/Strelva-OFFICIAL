import { describe, expect, it } from "vitest";
import {
  assessRisk,
  classifyOperation,
  generatePreviewDiffs,
  type AgentOperation,
} from "@/lib/agent-risk";

describe("assessRisk", () => {
  it("blocks auto-apply for structural / visibility / delete (high)", () => {
    for (const type of ["structural", "visibility", "delete"] as const) {
      const r = assessRisk({ type, section: "hero" });
      expect(r.level).toBe("high");
      expect(r.autoApply).toBe(false);
      expect(r.requiresPreview).toBe(true);
    }
  });

  it("treats reorder as medium, no auto-apply", () => {
    const r = assessRisk({ type: "reorder", section: "services" });
    expect(r).toMatchObject({ level: "medium", autoApply: false });
  });

  it("flags removing more than half the items as high", () => {
    const r = assessRisk({ type: "update", section: "services", itemCount: { before: 10, after: 4 } });
    expect(r.level).toBe("high");
    expect(r.reason).toContain("6 of 10");
  });

  it("flags adding many items at once as medium", () => {
    const r = assessRisk({ type: "update", section: "services", itemCount: { before: 2, after: 8 } });
    expect(r.level).toBe("medium");
    expect(r.reason).toContain("6 new items");
  });

  it("treats new content (add) as medium", () => {
    expect(assessRisk({ type: "add", section: "services" }).level).toBe("medium");
  });

  it("treats a >50% length rewrite as medium", () => {
    const r = assessRisk({
      type: "rewrite",
      section: "hero",
      before: "hi",
      after: "a far longer headline that more than doubles the original length",
    });
    expect(r.level).toBe("medium");
  });

  it("auto-applies a minor text edit (low)", () => {
    const r = assessRisk({ type: "rewrite", section: "hero", before: "Hello there", after: "Hello world" });
    expect(r).toMatchObject({ level: "low", autoApply: true, requiresPreview: false });
  });

  it("never auto-applies a same-length URL swap (content-aware, not length-only)", () => {
    const r = assessRisk({
      type: "rewrite",
      section: "contact",
      field: "bookingUrl",
      before: "https://calendly.com/owner",
      after: "https://evil.example/x",
    });
    expect(r).toMatchObject({ level: "medium", autoApply: false });
  });

  it("routes a bare price/hours/date fact edit to review (2nd-gate backstop for governance)", () => {
    // These plain-text facts carry no URL/markup, so only the field NAME flags them.
    // assessRisk must catch them so they aren't left to the governance classifier alone.
    for (const field of ["price", "hours", "openDate", "startTime"]) {
      const r = assessRisk({
        type: "rewrite",
        section: "contact",
        field,
        before: "9",
        after: "10",
      });
      expect(r).toMatchObject({ level: "medium", autoApply: false });
    }
  });

  it("never auto-applies a change that introduces markup/script", () => {
    const r = assessRisk({
      type: "rewrite",
      section: "hero",
      field: "headline",
      before: "Open daily 9 to 5",
      after: 'Open <script>steal()</script> 9-5',
    });
    expect(r).toMatchObject({ level: "medium", autoApply: false });
  });

  it("treats a structureless update (no string diff) as a low-risk no-op", () => {
    // classifyOperation only emits a bare "update" when nothing meaningful
    // changed, so auto-applying it is safe.
    const r = assessRisk({ type: "update", section: "contact" });
    expect(r).toMatchObject({ level: "low", autoApply: true });
  });

  it("defaults a truly-unknown operation type to medium review", () => {
    const r = assessRisk({
      type: "mystery" as unknown as AgentOperation["type"],
      section: "contact",
    });
    expect(r).toMatchObject({ level: "medium", autoApply: false });
  });
});

describe("classifyOperation", () => {
  it("classifies structural sections", () => {
    for (const section of ["theme", "navigation", "footer"] as const) {
      expect(classifyOperation(section, {}, {}).type).toBe("structural");
    }
  });

  it("detects array shrink as delete and growth as add (with counts)", () => {
    expect(classifyOperation("services", { services: [1, 2, 3] }, { services: [1] })).toMatchObject({
      type: "delete",
      itemCount: { before: 3, after: 1 },
    });
    expect(classifyOperation("services", { services: [1] }, { services: [1, 2, 3] })).toMatchObject({
      type: "add",
      itemCount: { before: 1, after: 3 },
    });
  });

  it("detects field add / delete / rewrite / no-op", () => {
    expect(classifyOperation("hero", { headline: "x" }, { headline: "x", tagline: "new" }).type).toBe("add");
    expect(classifyOperation("hero", { headline: "x", tagline: "old" }, { headline: "x" }).type).toBe("delete");
    expect(classifyOperation("hero", { headline: "old" }, { headline: "new" })).toMatchObject({
      type: "rewrite",
      field: "headline",
    });
    expect(classifyOperation("hero", { headline: "same" }, { headline: "same" }).type).toBe("update");
  });

  it("picks the WORST changed field, not the first (a link swap can't hide behind a benign edit)", () => {
    // `headline` sorts first and changed benignly; `bookingUrl` is the dangerous
    // change. The classifier must surface the booking URL so assessRisk gates it.
    const op = classifyOperation(
      "contact",
      { headline: "Welcome", bookingUrl: "https://calendly.com/owner" },
      { headline: "Welcome!", bookingUrl: "https://evil.example/x" },
    );
    expect(op).toMatchObject({ type: "rewrite", field: "bookingUrl" });
    expect(assessRisk(op)).toMatchObject({ level: "medium", autoApply: false });
  });
});

describe("generatePreviewDiffs", () => {
  it("reports added / removed / changed and skips unchanged", () => {
    const diffs = generatePreviewDiffs({ a: "old", b: "keep" }, { b: "keep", c: "new" });
    expect(diffs.find((d) => d.field === "a")?.type).toBe("removed");
    expect(diffs.find((d) => d.field === "c")?.type).toBe("added");
    expect(diffs.find((d) => d.field === "b")).toBeUndefined();
  });

  it("formats a changed scalar field", () => {
    const [d] = generatePreviewDiffs({ x: "old" }, { x: "new" });
    expect(d).toMatchObject({ field: "x", before: "old", after: "new", type: "changed" });
  });

  it("summarizes array values as item counts", () => {
    const [d] = generatePreviewDiffs({ items: [1, 2, 3] }, { items: [1, 2] });
    expect(d.before).toBe("[3 items]");
    expect(d.after).toBe("[2 items]");
  });
});
