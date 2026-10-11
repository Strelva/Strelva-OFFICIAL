// @vitest-environment jsdom
import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CountUp, formatDollars } from "@/components/ui/motion/CountUp";
import { EntranceProvider } from "@/components/ui/motion/Entrance";
import { AiMirror } from "@/experience/workspace/outcomes/AiMirror";
import { LocationHeatmap } from "@/experience/workspace/outcomes/LocationHeatmap";
import { LoopRibbon } from "@/experience/workspace/outcomes/LoopRibbon";
import { PriceSheet } from "@/experience/workspace/outcomes/PriceSheet";
import { RatingTrend } from "@/experience/workspace/outcomes/RatingTrend";
import { ReplyPattern } from "@/experience/workspace/outcomes/ReplyPattern";
import { SundayPictureText } from "@/experience/workspace/outcomes/SundayPictureText";
import { BAKERY_AI_MIRROR, BAKERY_AI_MIRROR_EMPTY, BAKERY_LEADS, BAKERY_LOOP, BAKERY_LOOP_EMPTY, BAKERY_LOOP_PARTIAL, BAKERY_PRICE_TERMS, BAKERY_RATINGS, BAKERY_REPORT, COMFORT_AIR_LOCATIONS } from "@/experience/workspace/preview/outcomes-fixture";

const roots: ReturnType<typeof createRoot>[] = [];

beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });

async function render(element: ReactElement) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(element));
  return container;
}

/** Text that assistive technology reads: skip aria-hidden subtrees. */
function spokenText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node instanceof Element && node.getAttribute("aria-hidden") === "true") return "";
  return [...node.childNodes].map(spokenText).join("");
}

describe("CountUp", () => {
  it("exposes the final value from the first frame and hides the animated digits", async () => {
    const container = await render(createElement(EntranceProvider, { value: { started: false, snap: false } }, createElement(CountUp, { value: 1840, format: formatDollars })));
    expect(container.querySelector("[aria-hidden='true']")!.textContent).toBe("$0");
    expect(container.querySelector(".sr-only")!.textContent).toBe("$1,840");
    expect(spokenText(container)).toBe("$1,840");
  });

  it("snaps to the end value under reduced motion or a hidden document", async () => {
    const container = await render(createElement(EntranceProvider, { value: { started: false, snap: true } }, createElement(CountUp, { value: 412 })));
    expect(container.querySelector("[aria-hidden='true']")!.textContent).toBe("412");
  });
});

describe("LoopRibbon", () => {
  it("renders every stage's final value, the estimate note and the chips as text", async () => {
    const container = await render(createElement(LoopRibbon, BAKERY_LOOP));
    const spoken = spokenText(container);
    expect(container.querySelector("h2")!.textContent).toBe("412 people found you. 9 became bookings.");
    for (const value of ["412", "23", "9", "$1,840"]) expect(spoken).toContain(value);
    expect(spoken).toContain("Estimated");
    expect(spoken).toContain("100% answered. $204 per booking.");
    expect(container.querySelectorAll("a[href='/preview/strelva/recaps']")).toHaveLength(4);
    expect(container.querySelector("svg[viewBox='0 0 1000 160'] path")!.getAttribute("d")).toMatch(/^M0 0 /);
  });

  it("says Not measured yet instead of zero", async () => {
    const partial = await render(createElement(LoopRibbon, BAKERY_LOOP_PARTIAL));
    expect(partial.textContent!.match(/Not measured yet/g)).toHaveLength(2);
    expect(spokenText(partial)).not.toMatch(/\$0|per booking/);
    const empty = await render(createElement(LoopRibbon, BAKERY_LOOP_EMPTY));
    expect(empty.textContent!.match(/Not measured yet/g)).toHaveLength(5);
    expect(empty.querySelector("svg")).toBeNull();
    expect(empty.querySelector("h2")!.textContent).toBe("This week isn't measured yet.");
  });
});

describe("AiMirror", () => {
  it("highlights the business, lists citations and draws only positive cells", async () => {
    const container = await render(createElement(AiMirror, { data: BAKERY_AI_MIRROR }));
    expect(container.querySelector("mark")!.textContent).toBe("Hertel Ave Bakery");
    expect(container.querySelectorAll("thead th")).toHaveLength(5);
    // 18 mentioned + 1 wrong-info-fixed = the 19 answers in the headline.
    expect(container.querySelectorAll("[role='img'][aria-label='Mentioned']")).toHaveLength(18);
    expect(container.querySelectorAll("[role='img'][aria-label='Had wrong info, fixed']")).toHaveLength(1);
    expect(container.textContent).not.toMatch(/not mentioned|not yet|missing/i);
  });

  it("shows the honest empty state with no matrix", async () => {
    const container = await render(createElement(AiMirror, { data: BAKERY_AI_MIRROR_EMPTY }));
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelector("h2")!.textContent).toBe("AI answers aren't checked yet.");
  });
});

describe("ReplyPattern", () => {
  it("renders a focusable pin per lead and a tooltip on focus", async () => {
    const container = await render(createElement(ReplyPattern, { leads: BAKERY_LEADS }));
    expect(container.querySelector("h2")!.textContent).toBe("Steady.");
    const pins = container.querySelectorAll("button[aria-label]");
    expect(pins).toHaveLength(23);
    const jess = [...pins].find(pin => pin.getAttribute("aria-label")!.includes("Jess")) as HTMLButtonElement;
    expect(jess.getAttribute("aria-label")).toBe("Thu 9:41 · Jess · answered in 2 min");
    await act(async () => jess.focus());
    expect(container.querySelector("[role='tooltip']")!.textContent).toBe("Thu 9:41 · Jess · answered in 2 min");
  });
});

describe("RatingTrend", () => {
  it("annotates the crossing and describes the chart", async () => {
    const container = await render(createElement(RatingTrend, { points: BAKERY_RATINGS, cutoffNote: "where 31% stop looking", crossingNote: "Jun · same-day replies start" }));
    expect(container.textContent).toContain("Jun · same-day replies start");
    expect(container.textContent).toContain("4.5 · where 31% stop looking");
    expect(container.querySelector("svg[role='img']")!.getAttribute("aria-label")).toBe("Rated 4.8 in Oct, climbing. May 4.3, Jun 4.4, Jul 4.5, Aug 4.6, Sep 4.7, Oct 4.8.");
  });
});

describe("SundayPictureText", () => {
  it("renders the picture, the bubbles and the plain-text fallback from one report", async () => {
    const container = await render(createElement(SundayPictureText, { report: BAKERY_REPORT }));
    expect(spokenText(container)).toContain("412");
    expect(container.textContent).toContain("$1,840 through Square. All 23 messages answered, typically in 4 min.");
    expect(container.querySelector("details p")!.textContent).toMatch(/^Your week at Hertel Ave: 412 people found you, 9 booked\./);
  });
});

describe("PriceSheet", () => {
  it("confirms through the real button exactly once", async () => {
    const onConfirm = vi.fn(async () => undefined);
    const container = await render(createElement(PriceSheet, { title: "Online booking with deposits", price: 120, terms: BAKERY_PRICE_TERMS, previewLabel: "Preview", onConfirm }));
    const button = [...container.querySelectorAll("button")].find(item => item.textContent === "Build it for $120")!;
    expect(button).toBeTruthy();
    await act(async () => { button.click(); button.click(); });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(container.querySelector("[role='status']")!.textContent).toBe("Confirmed. Strelva has your yes for $120.");
    expect(button.disabled).toBe(true);
  });

  it("reports a failed confirm and lets the owner try again", async () => {
    const onConfirm = vi.fn(async () => { throw new Error("nope"); });
    const container = await render(createElement(PriceSheet, { title: "T", price: 120, terms: [], previewLabel: "Preview", onConfirm }));
    const button = container.querySelector("button") as HTMLButtonElement;
    await act(async () => button.click());
    expect(container.querySelector("[role='status']")!.textContent).toBe("That didn't go through. Try again.");
    expect(button.disabled).toBe(false);
  });
});

describe("LocationHeatmap", () => {
  it("leads with the verdict and offers one action for the slipping location", async () => {
    const onAction = vi.fn();
    const container = await render(createElement(LocationHeatmap, { eyebrow: "Comfort Air", rows: COMFORT_AIR_LOCATIONS, onAction }));
    expect(container.querySelector("h2")!.textContent).toBe("Lockport is slipping.");
    const buttons = container.querySelectorAll("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.textContent).toBe("Route Lockport leads");
    await act(async () => buttons[0]!.click());
    expect(onAction).toHaveBeenCalledWith("lockport");
    expect(container.querySelectorAll("tbody td a")).toHaveLength(28);
    expect(container.textContent).toContain("3h10");
  });
});
