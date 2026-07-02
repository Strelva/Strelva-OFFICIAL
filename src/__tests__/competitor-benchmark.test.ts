import { describe, expect, it } from "vitest";
import { buildCompetitorBenchmark } from "@/lib/competitor-benchmark";
import type { VisibilitySnapshot } from "@/lib/visibility/snapshots";

function snap(
  serpResults: VisibilitySnapshot["serpResults"],
  aiResults: VisibilitySnapshot["aiResults"] = [],
): VisibilitySnapshot {
  return {
    tenantId: "acme",
    trade: "wellness",
    towns: ["Buffalo"],
    queriesPerWeek: 3,
    serpResults,
    aiResults,
    provider: "serper",
    checkedAt: new Date().toISOString(),
    estimatedMonthlyCostUsd: 0,
  };
}

function aiResult(query: string, mentioned: boolean, probed = true): VisibilitySnapshot["aiResults"][number] {
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

function result(query: string, yourPos: number | null, compName: string, compPos: number | null): VisibilitySnapshot["serpResults"][number] {
  return {
    query,
    provider: "serper",
    tenantPosition: yourPos,
    tenantInLocalPack: false,
    competitors: [{ name: compName, position: compPos, inLocalPack: false }],
    checkedAt: new Date().toISOString(),
    skipped: false,
  };
}

describe("buildCompetitorBenchmark", () => {
  it("scores leads and laggards across queries", () => {
    const b = buildCompetitorBenchmark(
      snap([
        result("yoga buffalo", 2, "Zen Studio", 5), // you lead
        result("pilates buffalo", 8, "Zen Studio", 3), // behind
      ]),
    );
    expect(b).not.toBeNull();
    expect(b!.total).toBe(2);
    expect(b!.leadCount).toBe(1);
    expect(b!.headline).toContain("1 of 2");
    expect(b!.rows.find((r) => r.query === "yoga buffalo")!.youLead).toBe(true);
    expect(b!.rows.find((r) => r.query === "pilates buffalo")!.youLead).toBe(false);
  });

  it("treats a local-pack appearance as beating an unranked competitor", () => {
    const r = result("massage buffalo", null, "Rival", null);
    r.tenantInLocalPack = true; // you're in the map pack, they're nowhere
    const b = buildCompetitorBenchmark(snap([r]));
    expect(b!.rows[0].youLead).toBe(true);
  });

  it("returns null without competitor data", () => {
    expect(buildCompetitorBenchmark(null)).toBeNull();
    expect(buildCompetitorBenchmark(snap([]))).toBeNull();
    const noComp = { ...result("x", 1, "y", 2), competitors: [] };
    expect(buildCompetitorBenchmark(snap([noComp]))).toBeNull();
  });

  it("skips errored SERP checks", () => {
    const skipped = { ...result("x", 1, "y", 2), skipped: true, skipReason: "no key" };
    expect(buildCompetitorBenchmark(snap([skipped]))).toBeNull();
  });

  it("surfaces AI-answer presence per query, keyed by the shared query", () => {
    const b = buildCompetitorBenchmark(
      snap(
        [
          result("yoga buffalo", 2, "Zen Studio", 5),
          result("pilates buffalo", 8, "Zen Studio", 3),
        ],
        [aiResult("yoga buffalo", true), aiResult("pilates buffalo", false)],
      ),
    );
    expect(b!.rows.find((r) => r.query === "yoga buffalo")!.aiAnswerMentioned).toBe(true);
    expect(b!.rows.find((r) => r.query === "pilates buffalo")!.aiAnswerMentioned).toBe(false);
  });

  it("reports null AI presence when the answer wasn't probed or has no data", () => {
    // No aiResults at all → null (no claim).
    const none = buildCompetitorBenchmark(snap([result("yoga buffalo", 2, "Zen Studio", 5)]));
    expect(none!.rows[0].aiAnswerMentioned).toBeNull();

    // Unprobed answer (no key / error) is ignored → still null.
    const unprobed = buildCompetitorBenchmark(
      snap([result("yoga buffalo", 2, "Zen Studio", 5)], [aiResult("yoga buffalo", false, false)]),
    );
    expect(unprobed!.rows[0].aiAnswerMentioned).toBeNull();
  });
});
