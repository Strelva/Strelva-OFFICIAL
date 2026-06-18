import { describe, expect, it } from "vitest";
import { diagnoseVisibility, summarizeVisibility } from "@/lib/visibility/diagnose";
import type { VisibilitySnapshot } from "@/lib/visibility/snapshots";

function snapshot(over: Partial<VisibilitySnapshot> = {}): VisibilitySnapshot {
  return {
    tenantId: "t1",
    trade: "bakery",
    towns: ["Buffalo"],
    queriesPerWeek: 2,
    provider: "serper.dev",
    checkedAt: "2026-06-17T00:00:00Z",
    estimatedMonthlyCostUsd: 1,
    serpResults: [],
    aiResults: [],
    ...over,
  };
}

describe("diagnoseVisibility", () => {
  it("flags an un-cited AI answer as a high, on-site finding", () => {
    const findings = diagnoseVisibility(
      snapshot({
        aiResults: [
          { query: "best bakery buffalo", model: "g", probed: true, tenantMentioned: false, competitors: [], checkedAt: "x", methodologyNote: "" },
        ],
      })
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ surface: "ai_answer", severity: "high", actionable: "on_site" });
    expect(findings[0].problem).toContain("Not cited in the AI answer");
  });

  it("ignores skipped SERP checks and AI probes that did not run", () => {
    const findings = diagnoseVisibility(
      snapshot({
        aiResults: [{ query: "q", model: "g", probed: false, tenantMentioned: false, competitors: [], checkedAt: "x", methodologyNote: "" }],
        serpResults: [{ query: "q", provider: "s", tenantPosition: null, tenantInLocalPack: false, competitors: [], checkedAt: "x", skipped: true }],
      })
    );
    expect(findings).toHaveLength(0);
  });

  it("flags missing organic rank (on-site) and missing local pack (off-site)", () => {
    const findings = diagnoseVisibility(
      snapshot({
        serpResults: [{ query: "plumber near me", provider: "s", tenantPosition: null, tenantInLocalPack: false, competitors: [], checkedAt: "x", skipped: false }],
      })
    );
    const organic = findings.find((f) => f.surface === "serp_organic");
    const pack = findings.find((f) => f.surface === "serp_local_pack");
    expect(organic).toMatchObject({ actionable: "on_site" });
    expect(pack).toMatchObject({ actionable: "off_site" });
  });

  it("sorts high-severity (AI) findings first", () => {
    const findings = diagnoseVisibility(
      snapshot({
        serpResults: [{ query: "q", provider: "s", tenantPosition: null, tenantInLocalPack: true, competitors: [], checkedAt: "x", skipped: false }],
        aiResults: [{ query: "q", model: "g", probed: true, tenantMentioned: false, competitors: [], checkedAt: "x", methodologyNote: "" }],
      })
    );
    expect(findings[0].severity).toBe("high");
  });
});

describe("summarizeVisibility", () => {
  it("counts presence across surfaces", () => {
    const s = summarizeVisibility(
      snapshot({
        aiResults: [
          { query: "a", model: "g", probed: true, tenantMentioned: true, competitors: [], checkedAt: "x", methodologyNote: "" },
          { query: "b", model: "g", probed: true, tenantMentioned: false, competitors: [], checkedAt: "x", methodologyNote: "" },
        ],
        serpResults: [
          { query: "a", provider: "s", tenantPosition: 2, tenantInLocalPack: true, competitors: [], checkedAt: "x", skipped: false },
          { query: "b", provider: "s", tenantPosition: null, tenantInLocalPack: false, competitors: [], checkedAt: "x", skipped: false },
        ],
      })
    );
    expect(s).toMatchObject({ aiProbed: 2, aiPresent: 1, serpChecked: 2, serpRanked: 1, localPackPresent: 1 });
    expect(s.problemCount).toBeGreaterThan(0);
    expect(s.topProblems.length).toBeLessThanOrEqual(3);
  });
});
