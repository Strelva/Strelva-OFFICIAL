import { describe, expect, it } from "vitest";
import { visibilityProofHighlights } from "@/lib/weekly-brief";
import type { VisibilityDiff } from "@/lib/visibility/snapshots";

function diff(changes: VisibilityDiff["changes"]): VisibilityDiff {
  return {
    tenantId: "t",
    previousCheckedAt: "2026-06-10T00:00:00Z",
    currentCheckedAt: "2026-06-17T00:00:00Z",
    changes,
    hasSignal: changes.length > 0,
  };
}

describe("visibilityProofHighlights", () => {
  it("turns AI-answer and ranking wins into owner-facing proof", () => {
    const out = visibilityProofHighlights(
      diff([
        { query: "gift box", surface: "ai_answer", before: false, after: true, direction: "appeared" },
        { query: "plumber", surface: "serp_organic", before: null, after: 4, direction: "appeared" },
      ])
    );
    expect(out[0]).toContain("AI answers");
    expect(out[0]).toContain("gift box");
    expect(out.some((l) => l.includes("page 1 of Google"))).toBe(true);
  });

  it("ignores losses — those are an operator concern, not an owner win", () => {
    const out = visibilityProofHighlights(
      diff([
        { query: "x", surface: "ai_answer", before: true, after: false, direction: "disappeared" },
        { query: "y", surface: "serp_organic", before: 3, after: 8, direction: "declined" },
      ])
    );
    expect(out).toHaveLength(0);
  });

  it("caps at two proof lines", () => {
    const out = visibilityProofHighlights(
      diff(
        ["a", "b", "c"].map((q) => ({
          query: q,
          surface: "ai_answer" as const,
          before: false,
          after: true,
          direction: "appeared" as const,
        }))
      )
    );
    expect(out).toHaveLength(2);
  });
});
