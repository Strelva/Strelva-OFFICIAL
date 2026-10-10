import { describe, expect, it } from "vitest";
import { buildAiVisibilityScorecard } from "@/lib/ai-visibility-scorecard";
import type { VisibilitySnapshot } from "@/lib/visibility/snapshots";
import { staggerDelay, strelvaEntrance, strelvaMotion } from "@/platform/infra/motion";
import * as legacyMotion from "@/lib/motion";
import { loopChips, loopHeadline, loopRibbonGeometry, type LoopStage } from "@/experience/workspace/outcomes/loop";
import { aiMirrorFromScorecard, aiMirrorHeadline, aiMirrorMatrix, splitAnswer } from "@/experience/workspace/outcomes/ai-mirror";
import { arrivalOrder, formatReplyTime, median, pinLayout, replyVerdict, type ReplyLead } from "@/experience/workspace/outcomes/reply-pattern";
import { ratingChartGeometry, ratingCrossing, ratingTrendWord } from "@/experience/workspace/outcomes/rating-trend";
import { weeklyReportBubbles, weeklyReportText, type WeeklyReport } from "@/experience/workspace/outcomes/weekly-report";
import { SLIDE_COMMIT_THRESHOLD, confirmLabel, slideCommits, slideProgress } from "@/experience/workspace/outcomes/price-sheet";
import { HEAT_EMPTY, HEAT_SCALE, formatTileMinutes, heatStep, heatmapVerdict, type HeatmapRow } from "@/experience/workspace/outcomes/location-heatmap";
import { BAKERY_LEADS, BAKERY_LOOP, BAKERY_RATINGS, BAKERY_REPORT, COMFORT_AIR_LOCATIONS } from "@/experience/workspace/preview/outcomes-fixture";

describe("staggerDelay (reveal role)", () => {
  it("keeps legacy and workspace consumers on the same motion roles", () => {
    expect(legacyMotion.strelvaMotion).toBe(strelvaMotion);
    expect(legacyMotion.strelvaEntrance).toBe(strelvaEntrance);
    expect(legacyMotion.staggerDelay).toBe(staggerDelay);
  });

  it("steps 40 ms and caps at the sixth item", () => {
    expect([0, 1, 5].map(index => staggerDelay(index))).toEqual([0, 0.04, 0.2]);
    expect(staggerDelay(6)).toBe(0.2);
    expect(staggerDelay(40)).toBe(0.2);
    expect(staggerDelay(-3)).toBe(0);
  });
});

const stages = (values: Partial<Record<LoopStage["key"], number | null>>): LoopStage[] => BAKERY_LOOP.stages.map(stage => ({ ...stage, value: stage.key in values ? values[stage.key] ?? null : stage.value }));

describe("loopRibbonGeometry", () => {
  it("tapers from found to booked and keeps earned at booked's thickness", () => {
    const geometry = loopRibbonGeometry(BAKERY_LOOP.stages, { width: 1000, height: 160 });
    const [found, asked, answered, booked, earned] = geometry.segments.map(segment => segment.thickness);
    expect(found).toBe(160);
    expect(asked).toBeLessThan(found!);
    expect(answered).toBe(asked);
    expect(booked).toBeLessThan(asked!);
    expect(earned).toBe(booked);
    expect(geometry.segments.map(segment => [segment.x0, segment.x1])).toEqual([[0, 200], [200, 400], [400, 600], [600, 800], [800, 1000]]);
    expect(geometry.path.startsWith("M0 0 L200 0 L230 ")).toBe(true);
    expect(geometry.path.endsWith("Z")).toBe(true);
  });

  it("is symmetric about the centre line", () => {
    const geometry = loopRibbonGeometry(BAKERY_LOOP.stages, { width: 1000, height: 160 });
    const points = geometry.path.replace(/^M|Z$/g, "").split(" L").map(pair => pair.trim().split(" ").map(Number));
    const half = points.length / 2;
    for (let index = 0; index < half; index += 1) {
      const top = points[index]!;
      const bottom = points[points.length - 1 - index]!;
      expect(bottom[0]).toBe(top[0]);
      expect((top[1]! + bottom[1]!) / 2).toBeCloseTo(80, 5);
    }
  });

  it("marks unmeasured stages and carries thickness through them", () => {
    const geometry = loopRibbonGeometry(stages({ booked: null, earned: null }));
    expect(geometry.segments.map(segment => segment.measured)).toEqual([true, true, true, false, false]);
    expect(geometry.segments[3]!.thickness).toBe(geometry.segments[2]!.thickness);
  });

  it("draws nothing when no stage is measured", () => {
    const geometry = loopRibbonGeometry(stages({ found: null, asked: null, answered: null, booked: null, earned: null }));
    expect(geometry.path).toBe("");
    expect(geometry.segments).toEqual([]);
  });

  it("floors tiny and zero stages at the minimum thickness", () => {
    const geometry = loopRibbonGeometry(stages({ found: 10_000, booked: 0 }), { minThickness: 8 });
    expect(geometry.segments[3]!.thickness).toBe(8);
  });
});

describe("loop copy", () => {
  it("headlines found and booked, never inventing an unmeasured stage", () => {
    expect(loopHeadline(BAKERY_LOOP.stages)).toBe("412 people found you. 9 became bookings.");
    expect(loopHeadline(stages({ booked: null }))).toBe("412 people found you.");
    expect(loopHeadline(stages({ found: null, booked: 1 }))).toBe("1 booking this week.");
    expect(loopHeadline(stages({ found: null, booked: null }))).toBe("This week isn't measured yet.");
  });

  it("only shows ratio chips when both numbers exist", () => {
    expect(loopChips(BAKERY_LOOP.stages).map(chip => chip.text)).toEqual(["100% answered", "$204 per booking"]);
    expect(loopChips(stages({ earned: null })).map(chip => chip.key)).toEqual(["answer-rate"]);
    expect(loopChips(stages({ asked: 0, booked: 0 }))).toEqual([]);
  });
});

function aiResult(query: string, mentioned: boolean, probed = true): VisibilitySnapshot["aiResults"][number] {
  return { query, model: "gemini-2.5-flash", probed, tenantMentioned: mentioned, competitors: [], checkedAt: "2026-10-05T12:00:00Z", methodologyNote: "test" };
}

function snap(aiResults: VisibilitySnapshot["aiResults"]): VisibilitySnapshot {
  return { tenantId: "acme", trade: "bakery", towns: ["Buffalo, NY"], queriesPerWeek: 3, serpResults: [], aiResults, provider: "serper", checkedAt: "2026-10-05T12:00:00Z", estimatedMonthlyCostUsd: 0 };
}

describe("AI mirror honesty rails", () => {
  it("adapts the scorecard to one probed column with mentioned cells only", () => {
    const scorecard = buildAiVisibilityScorecard(snap([aiResult("bakery near me", true), aiResult("wedding cake", false), aiResult("catering", true), aiResult("unprobed", false, false)]), null);
    const data = aiMirrorFromScorecard(scorecard, { businessName: "Hertel Ave Bakery", area: "Buffalo" })!;
    expect(data.assistants).toEqual([{ id: "gemini", label: "Gemini" }]);
    expect(data.total).toBe(3);
    expect(data.mentionedCount).toBe(2);
    expect(data.rows.map(row => row.query)).toEqual(["bakery near me", "catering"]);
    expect(data.rows.every(row => Object.values(row.cells).every(state => state === "mentioned"))).toBe(true);
    expect(JSON.stringify(data)).not.toMatch(/not.?mentioned|missing|unprobed|wedding cake/i);
    expect(data.eyebrow).toBe("When Buffalo asks AI");
  });

  it("returns null when tracking hasn't started and no columns when nothing was probed", () => {
    expect(aiMirrorFromScorecard(null, { businessName: "X" })).toBeNull();
    const data = aiMirrorFromScorecard(buildAiVisibilityScorecard(snap([aiResult("q", false, false)]), null), { businessName: "X" })!;
    expect(data).toMatchObject({ total: 0, mentionedCount: 0, assistants: [], rows: [] });
    expect(aiMirrorHeadline(data)).toBe("AI answers aren't checked yet.");
  });

  it("claims new appearances only against a probed prior week", () => {
    const previous = snap([aiResult("catering", false), aiResult("cake", true)]);
    const scorecard = buildAiVisibilityScorecard(snap([aiResult("catering", true), aiResult("cake", true)]), previous);
    expect(aiMirrorFromScorecard(scorecard, { businessName: "X" })!.summary).toBe("New this week in 1 answer.");
  });

  it("drops non-positive cells, unknown assistants and empty rows from the matrix", () => {
    const matrix = aiMirrorMatrix([{ id: "a", label: "A" }], [
      { query: "one", cells: { a: "mentioned", b: "mentioned" } },
      { query: "two", cells: { a: "not_mentioned" as never } },
      { query: "three", cells: { a: "wrong_info_fixed" } },
    ]);
    expect(matrix.rows).toEqual([{ query: "one", cells: { a: "mentioned" } }, { query: "three", cells: { a: "wrong_info_fixed" } }]);
    expect(matrix.hasFixed).toBe(true);
  });

  it("headlines the honest denominator and splits the answer around the name", () => {
    expect(aiMirrorHeadline({ mentionedCount: 19, total: 24 })).toBe("You're in 19 of 24 answers.");
    expect(aiMirrorHeadline({ mentionedCount: 0, total: 3 })).toBe("Strelva checked 3 AI answers this week.");
    expect(splitAnswer("Your best bet is hertel ave bakery. Trays", "Hertel Ave Bakery")).toEqual({ before: "Your best bet is ", match: "hertel ave bakery", after: ". Trays" });
    expect(splitAnswer("No name here", "Hertel")).toBeNull();
  });
});

describe("reply pattern", () => {
  const lead = (minutes: number | null, day = 0, time = "9:00"): ReplyLead => ({ id: `${day}-${time}-${minutes}`, day, time, name: "A", minutes });

  it("calls an all-fast week Steady", () => {
    expect(replyVerdict(BAKERY_LEADS)).toEqual({ word: "Steady.", chip: "23 of 23 under 5 min", tone: "good" });
    expect(median(BAKERY_LEADS.map(item => item.minutes as number))).toBe(4);
  });

  it("grades slower weeks and waiting leads", () => {
    expect(replyVerdict([])).toMatchObject({ word: "No leads yet.", chip: null });
    expect(replyVerdict([...Array(8)].map(() => lead(3)).concat([lead(20), lead(30)])).word).toBe("Mostly quick.");
    expect(replyVerdict([lead(3), lead(40), lead(50)]).word).toBe("Slowing.");
    expect(replyVerdict([lead(90), lead(120), lead(3)]).word).toBe("Slow.");
    expect(replyVerdict([lead(3), lead(null)])).toMatchObject({ word: "1 waiting.", chip: "1 of 2 under 5 min", tone: "needs" });
  });

  it("orders arrivals by day then time and sizes stems to the slowest reply", () => {
    const leads = [lead(2, 1, "8:00"), lead(4, 0, "14:30"), lead(1, 0, "9:05")];
    expect(arrivalOrder(leads).map(item => item.minutes)).toEqual([1, 4, 2]);
    const pins = pinLayout(leads);
    expect(pins.map(pin => pin.order)).toEqual([0, 1, 2]);
    expect(pins.find(pin => pin.lead.minutes === 1)!.height).toBeCloseTo(0.2);
    expect(pins.find(pin => pin.lead.minutes === 1)!.x).toBeCloseTo(1 / 3);
    expect(pinLayout([lead(null)])[0]!.height).toBe(1);
    expect(formatReplyTime(65)).toBe("1 h 5 min");
  });
});

describe("rating trend", () => {
  it("finds the upward crossing of 4.5 and interpolates it", () => {
    const crossing = ratingCrossing(BAKERY_RATINGS)!;
    expect(crossing).toMatchObject({ index: 2, direction: "up" });
    expect(crossing.t).toBeCloseTo((4.5 - 4.38) / (4.54 - 4.38));
    const geometry = ratingChartGeometry(BAKERY_RATINGS, { width: 600, height: 200, inset: 16 });
    expect(geometry.crossing!.y).toBe(geometry.cutoffY);
    expect(geometry.crossing!.x).toBeGreaterThan(geometry.coords[1]!.x);
    expect(geometry.crossing!.x).toBeLessThan(geometry.coords[2]!.x);
    expect(geometry.area.endsWith("Z")).toBe(true);
  });

  it("reports the latest crossing, either direction, or none", () => {
    expect(ratingCrossing([{ label: "a", rating: 4.6 }, { label: "b", rating: 4.4 }])).toMatchObject({ index: 1, direction: "down" });
    expect(ratingCrossing([{ label: "a", rating: 4.6 }, { label: "b", rating: 4.7 }])).toBeNull();
    expect(ratingTrendWord(BAKERY_RATINGS)).toBe("Climbing");
    expect(ratingTrendWord([{ label: "a", rating: 4.6 }, { label: "b", rating: 4.62 }])).toBe("Holding");
    expect(ratingTrendWord([{ label: "a", rating: 4.6 }, { label: "b", rating: 4.4 }])).toBe("Slipping");
  });
});

describe("weeklyReportText", () => {
  it("writes the full week as one plain SMS", () => {
    expect(weeklyReportText(BAKERY_REPORT)).toBe("Your week at Hertel Ave: 412 people found you, 9 booked. $1,840 through Square. All 23 messages answered, typically in 4 min. One thing needs you: the catering page. Reply YES to put it live.");
    expect(weeklyReportBubbles(BAKERY_REPORT)).toHaveLength(2);
  });

  it("leaves out what isn't measured instead of writing zero", () => {
    const partial: WeeklyReport = { ...BAKERY_REPORT, booked: null, earned: null, messages: { total: 5, answered: 4, typicalMinutes: null }, needsYou: null };
    expect(weeklyReportText(partial)).toBe("Your week at Hertel Ave: 412 people found you. 4 of 5 messages answered.");
    const nothing: WeeklyReport = { place: "Hertel Ave", found: null, booked: null, earned: null, messages: null, needsYou: null };
    expect(weeklyReportText(nothing)).toBe("Your week at Hertel Ave: Strelva is still connecting your numbers. Nothing needs you.");
    expect(weeklyReportText(nothing)).not.toMatch(/\b0\b/);
  });
});

describe("slide to confirm", () => {
  it("commits only past 85% of the track", () => {
    expect(SLIDE_COMMIT_THRESHOLD).toBe(0.85);
    expect(slideCommits(86, 100)).toBe(true);
    expect(slideCommits(85, 100)).toBe(false);
    expect(slideCommits(40, 100)).toBe(false);
    expect(slideCommits(150, 100)).toBe(true);
    expect(slideCommits(50, 0)).toBe(false);
    expect(slideProgress(-10, 100)).toBe(0);
    expect(slideProgress(Number.NaN, 100)).toBe(0);
    expect(confirmLabel(120)).toBe("Build it for $120");
    expect(confirmLabel(1250, "Turn it on")).toBe("Turn it on for $1,250");
  });
});

describe("location heatmap", () => {
  it("maps minutes onto the contract's six-step scale", () => {
    expect(HEAT_SCALE.map(step => step.fill)).toEqual(["#3F5E43", "#7FA374", "#C9D6C3", "#F1DCC9", "#E3A983", "#B4693F"]);
    expect([2, 6, 18, 40, 75, 190].map(minutes => heatStep(minutes).fill)).toEqual(HEAT_SCALE.map(step => step.fill));
    expect([5, 15, 30, 60, 150].map(minutes => heatStep(minutes).fill)).toEqual(HEAT_SCALE.slice(0, 5).map(step => step.fill));
    expect(heatStep(null)).toBe(HEAT_EMPTY);
    expect([22, 60, 75, 120, 190].map(formatTileMinutes)).toEqual(["22m", "1h", "1h15", "2h", "3h10"]);
  });

  it("names the slipping location and its worst day", () => {
    const verdict = heatmapVerdict(COMFORT_AIR_LOCATIONS);
    expect(verdict.headline).toBe("Lockport is slipping.");
    expect(verdict.detail).toBe("Its replies drifted past an hour on Thursday.");
    expect(verdict.worst?.id).toBe("lockport");
    expect(verdict.worstDay).toBe(3);
  });

  it("praises a fast week and handles no data", () => {
    const fast: HeatmapRow[] = COMFORT_AIR_LOCATIONS.filter(row => row.id !== "lockport");
    expect(heatmapVerdict(fast)).toMatchObject({ headline: "Every location is answering fast.", worst: null });
    expect(heatmapVerdict([{ id: "a", name: "Amherst", days: [null, null, null, null, null, null, null] }])).toMatchObject({ headline: "No replies to compare yet.", worst: null });
  });
});
