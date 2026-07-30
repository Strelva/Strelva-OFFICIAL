import { describe, expect, it } from "vitest";
import { diagnoseVisibility, summarizeVisibility, visibilityHeadline } from "@/lib/visibility/diagnose";
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
    expect(findings[0]!).toMatchObject({ surface: "ai_answer", severity: "high", actionable: "on_site" });
    expect(findings[0]!.problem).toContain("Not cited in the AI answer");
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
    expect(findings[0]!.severity).toBe("high");
  });
});

describe("finding impact + quantified", () => {
  it("attaches a plain-English impact to every finding", () => {
    const findings = diagnoseVisibility(
      snapshot({
        aiResults: [{ query: "best bakery buffalo", model: "g", probed: true, tenantMentioned: false, competitors: [], checkedAt: "x", methodologyNote: "" }],
        serpResults: [{ query: "bakery buffalo", provider: "s", tenantPosition: null, tenantInLocalPack: false, competitors: [], checkedAt: "x", skipped: false }],
      })
    );
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.impact).toBeTruthy();
      expect(f.impact).toContain(f.query);
    }
  });

  it("quantifies from REAL named competitors, not an invented dollar figure", () => {
    const ai = diagnoseVisibility(
      snapshot({
        aiResults: [
          {
            query: "emergency plumber buffalo",
            model: "g",
            probed: true,
            tenantMentioned: false,
            competitors: [
              { name: "A Plumbing", mentioned: true },
              { name: "B Plumbing", mentioned: true },
              { name: "C Plumbing", mentioned: false },
            ],
            checkedAt: "x",
            methodologyNote: "",
          },
        ],
      })
    )[0]!;
    expect(ai.quantified).toBe("2 competitors named instead of you");
    // Honesty rail: never a fabricated dollar/traffic number.
    expect(ai.quantified).not.toMatch(/\$|\/mo/);
  });

  it("omits the quantified line when the probe named no rivals (qualitative only)", () => {
    const ai = diagnoseVisibility(
      snapshot({
        aiResults: [{ query: "q", model: "g", probed: true, tenantMentioned: false, competitors: [], checkedAt: "x", methodologyNote: "" }],
      })
    )[0]!;
    expect(ai.quantified).toBeUndefined();
    expect(ai.impact).toBeTruthy();
  });

  it("quantifies SERP gaps from real ranking / local-pack competitor counts", () => {
    const findings = diagnoseVisibility(
      snapshot({
        serpResults: [
          {
            query: "roofer buffalo",
            provider: "s",
            tenantPosition: null,
            tenantInLocalPack: false,
            competitors: [
              { name: "R1", position: 2, inLocalPack: true },
              { name: "R2", position: null, inLocalPack: true },
            ],
            checkedAt: "x",
            skipped: false,
          },
        ],
      })
    );
    const organic = findings.find((f) => f.surface === "serp_organic");
    const pack = findings.find((f) => f.surface === "serp_local_pack");
    expect(organic?.quantified).toBe("1 competitor ranking on page 1 where you're not");
    expect(pack?.quantified).toBe("2 competitors in the 3-pack where you're not");
  });
});

describe("visibilityHeadline", () => {
  it("leads with the AI wedge and names the gap query when partially cited", () => {
    const snap = snapshot({
      aiResults: [
        { query: "best bakery buffalo", model: "g", probed: true, tenantMentioned: true, competitors: [], checkedAt: "x", methodologyNote: "" },
        { query: "gluten free bakery buffalo", model: "g", probed: true, tenantMentioned: false, competitors: [], checkedAt: "x", methodologyNote: "" },
      ],
    });
    const headline = visibilityHeadline(summarizeVisibility(snap), diagnoseVisibility(snap));
    expect(headline).toBe('Cited in 1 of 2 AI answers. The wedge gap is "gluten free bakery buffalo".');
  });

  it("celebrates full AI citation without shame", () => {
    const snap = snapshot({
      aiResults: [{ query: "q", model: "g", probed: true, tenantMentioned: true, competitors: [], checkedAt: "x", methodologyNote: "" }],
    });
    const headline = visibilityHeadline(summarizeVisibility(snap), diagnoseVisibility(snap));
    expect(headline).toContain("You're who the assistant names");
  });

  it("falls back to the SERP signal when no AI probe ran", () => {
    const snap = snapshot({
      aiResults: [{ query: "q", model: "g", probed: false, tenantMentioned: false, competitors: [], checkedAt: "x", methodologyNote: "" }],
      serpResults: [{ query: "bakery buffalo", provider: "s", tenantPosition: null, tenantInLocalPack: false, competitors: [], checkedAt: "x", skipped: false }],
    });
    const headline = visibilityHeadline(summarizeVisibility(snap), diagnoseVisibility(snap));
    expect(headline).toContain("On page 1 for 0 of 1 searches checked");
    expect(headline).toContain('Start with "bakery buffalo"');
  });

  it("returns null when nothing was measured", () => {
    const snap = snapshot();
    expect(visibilityHeadline(summarizeVisibility(snap), diagnoseVisibility(snap))).toBeNull();
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
