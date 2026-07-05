import { describe, expect, it } from "vitest";
import { buildAiVisibilityScorecard } from "@/lib/ai-visibility-scorecard";
import type { VisibilitySnapshot } from "@/lib/visibility/snapshots";

function aiResult(
  query: string,
  mentioned: boolean,
  probed = true
): VisibilitySnapshot["aiResults"][number] {
  return {
    query,
    model: "gemini-2.5-flash",
    probed,
    tenantMentioned: mentioned,
    competitors: [],
    checkedAt: new Date().toISOString(),
    methodologyNote: "test",
  };
}

function snap(
  aiResults: VisibilitySnapshot["aiResults"],
  overrides: Partial<VisibilitySnapshot> = {}
): VisibilitySnapshot {
  return {
    tenantId: "acme",
    trade: "plumber",
    towns: ["Buffalo, NY"],
    queriesPerWeek: 3,
    serpResults: [],
    aiResults,
    provider: "serper",
    checkedAt: new Date().toISOString(),
    estimatedMonthlyCostUsd: 0,
    ...overrides,
  };
}

describe("buildAiVisibilityScorecard", () => {
  it("returns null when there is no snapshot at all (not tracking yet)", () => {
    expect(buildAiVisibilityScorecard(null, null)).toBeNull();
  });

  it("empty state: snapshot exists but nothing was probed → hasData false, no counts", () => {
    // No AI key / errors → every probe is probed:false. That is the honest
    // "we're checking weekly, first results land here" state.
    const card = buildAiVisibilityScorecard(
      snap([aiResult("emergency plumber Buffalo, NY", false, false)]),
      null
    );
    expect(card).not.toBeNull();
    expect(card!.hasData).toBe(false);
    expect(card!.total).toBe(0);
    expect(card!.mentionedCount).toBe(0);
    expect(card!.mentionedQueries).toEqual([]);
  });

  it("populated: counts only probed answers and lists the queries you're named in", () => {
    const card = buildAiVisibilityScorecard(
      snap([
        aiResult("emergency plumber Buffalo, NY", true),
        aiResult("plumber near me Buffalo, NY", false),
        aiResult("plumber repair Buffalo, NY", true),
        aiResult("unprobed query", true, false), // no key/error → not counted at all
      ]),
      null
    );
    expect(card!.hasData).toBe(true);
    expect(card!.total).toBe(3); // only the 3 probed answers
    expect(card!.mentionedCount).toBe(2);
    expect(card!.mentionedQueries).toEqual([
      "emergency plumber Buffalo, NY",
      "plumber repair Buffalo, NY",
    ]);
    expect(card!.service).toBe("plumber");
  });

  it("never claims a trend on the first snapshot (no previous → no newlyAppeared)", () => {
    const card = buildAiVisibilityScorecard(
      snap([aiResult("emergency plumber Buffalo, NY", true)]),
      null
    );
    expect(card!.newlyAppeared).toEqual([]);
  });

  it("trend: newlyAppeared only when last week probed-and-absent for that query", () => {
    const previous = snap([
      aiResult("emergency plumber Buffalo, NY", false), // probed, absent last week
      aiResult("plumber repair Buffalo, NY", true), // already named last week
    ]);
    const latest = snap([
      aiResult("emergency plumber Buffalo, NY", true), // NEW win
      aiResult("plumber repair Buffalo, NY", true), // not new
      aiResult("plumber near me Buffalo, NY", true), // not in previous at all → not claimed new
    ]);
    const card = buildAiVisibilityScorecard(latest, previous);
    expect(card!.newlyAppeared).toEqual(["emergency plumber Buffalo, NY"]);
  });
});
