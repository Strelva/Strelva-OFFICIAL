// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerToday } from "@/experience/workspace/today/OwnerToday";
import { OwnerDecisionView } from "@/experience/workspace/today/OwnerDecisionView";
import { RequestsView } from "@/experience/workspace/today/OwnerRequests";
import { RunningChecksView } from "@/experience/workspace/today/OwnerRunning";
import { sinceLines, todayGreeting, todayLede, yesLabel, yesPhase, yesSteps } from "@/experience/workspace/today/today-model";
import type { NeedsYouState } from "@/experience/workspace/useNeedsYou";
import { HARBOR, PREVIEW_NOW, REQUEST_ROWS, SECOND_DECISION, SINCE, decision, harborSystems, runningProof, yesReceipt } from "@/experience/workspace/preview/xa-owner-today-fixture";

const noop = () => undefined;
const ready = (over: Partial<Extract<NeedsYouState, { status: "ready" }>> = {}): NeedsYouState => ({ status: "ready", role: "owner", items: [decision()], complete: true, handled: SINCE, handledAvailable: true, ...over });
const MINUTE = Math.floor(PREVIEW_NOW / 60_000);
const today = (over: Partial<Parameters<typeof OwnerToday>[0]> = {}) => renderToStaticMarkup(createElement(OwnerToday, {
  businessName: HARBOR.name, ownerName: HARBOR.owner, minute: MINUTE, now: PREVIEW_NOW, needs: ready(), notices: {}, systems: harborSystems(),
  onAsk: noop, onReview: noop, onAllWaiting: noop, onRetry: noop, onWhatChanged: noop, systemHref: id => `/s/${id}`, ...over,
}));
const decisionView = (over: Partial<Parameters<typeof OwnerDecisionView>[0]> = {}) => renderToStaticMarkup(createElement(OwnerDecisionView, {
  businessName: HARBOR.name, needs: ready(), pending: null, notices: {}, systems: harborSystems(), now: PREVIEW_NOW,
  onDecide: noop, onUndo: noop, onRetry: noop, onToday: noop, onWhatChanged: noop, onOpenDecision: noop, ...over,
}));

describe("XA-3 words and states", () => {
  it("greets by recorded name only, and never claims a time of day without a clock", () => {
    expect(todayGreeting(null, "Dr. Lin")).toBe("Welcome back, Dr. Lin.");
    expect(todayGreeting(MINUTE, null)).toMatch(/^Good (morning|afternoon|evening)\.$/);
  });

  it("says exceptions first and claims nothing about decisions it did not read", () => {
    const systems = harborSystems();
    expect(todayLede({ waiting: 0, canDecide: true, systems, unchecked: false })).toBe(`Nothing needs you. Everything passed its checks at ${new Date(systems[0]!.health.lastVerifiedAt!).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase().replace(/\s?am$/, "").replace(/\s?pm$/, " pm")}.`);
    expect(todayLede({ waiting: 1, canDecide: false, systems, unchecked: false })).toMatch(/^One thing waits for the owner\. The rest passed their checks/);
    expect(todayLede({ waiting: 0, canDecide: true, systems: harborSystems({ bookingsDown: true }), unchecked: false })).toBe("Bookings needs a look. Strelva is on it.");
    expect(todayLede({ waiting: 0, canDecide: true, systems, unchecked: false, decisionsKnown: false })).not.toContain("Nothing needs you");
    expect(todayLede({ waiting: 0, canDecide: true, systems, unchecked: true })).not.toContain("Nothing needs you");
  });

  it("dates older changes instead of calling them since yesterday when there is no clock", () => {
    expect(sinceLines(SINCE, null).every(line => !line.recent && /^[A-Z][a-z]{2} \d+$/.test(line.time))).toBe(true);
    expect(sinceLines(SINCE, PREVIEW_NOW).every(line => line.recent)).toBe(true);
  });

  it("uses the board's yes words and the decision's own verbs", () => {
    expect(yesLabel(decision())).toBe("Put it live");
    expect(yesLabel(decision({ kind: "customer.message" }))).toBe("Send it");
    expect(yesLabel(decision({ kind: "fact.inferred", sourceLifecycle: "connected_site_schema" }))).toBe("Acknowledge");
  });

  it("moves the one yes only on real server state", () => {
    const base = { itemId: "x", open: true, pending: null, saidYes: false, expired: false };
    expect(yesPhase(base)).toBe("waiting");
    expect(yesPhase({ ...base, pending: "x" })).toBe("going");
    expect(yesPhase({ ...base, saidYes: true, notice: { tone: "error", text: "No" } })).toBe("failed");
    expect(yesPhase({ ...base, open: false, saidYes: true })).toBe("live");
    expect(yesPhase({ ...base, open: false, saidYes: true, expired: true })).toBe("expired");
    expect(yesPhase({ ...base, open: false, saidYes: true, receipt: yesReceipt("undone") })).toBe("undone");
    // A Not yet is never shown as Live.
    expect(yesPhase({ ...base, open: false, notice: { tone: "done", text: "Not yet." } })).toBe("waiting");
    expect(yesSteps(undefined, "failed").map(step => step.state)).toEqual(["failed"]);
    expect(yesSteps(yesReceipt(), "live").map(step => step.label)).toContain("Strelva read it back");
  });
});

describe("Today (O1, O2)", () => {
  it("docks the one waiting item on the composer with whoever prepared it", () => {
    const html = today();
    expect(html).toContain("Good morning, Dr. Lin.");
    expect(html).toContain("Waits for you · from North Studio");
    expect(html).toContain('aria-label="Review: Close online booking for Thanksgiving"');
    expect(html).not.toContain("data-xa-primary");
  });

  it("is a normal morning with what changed beside Pebble when nothing waits", () => {
    const html = today({ needs: ready({ items: [] }) });
    expect(html).toContain("Nothing needs you.");
    expect(html).toContain("Since yesterday");
    expect(html).toContain("Strelva renewed the security certificate for harbordental.com.");
    expect(html).toContain("pose-resting");
  });

  it("tells a member the item waits for the owner, and a shared reader gets no composer", () => {
    expect(today({ needs: ready({ role: "member" }) })).toContain("Waits for the owner · from North Studio");
    const shared = today({ readOnly: true, readOnlyNote: "Harbor Dental shared this with your agency to review." });
    expect(shared).not.toContain("<textarea");
    expect(shared).toContain("Harbor Dental shared this with your agency to review.");
  });

  it("puts Pebble in frame, fixing, for bad news", () => {
    expect(today({ needs: ready({ items: [] }), systems: harborSystems({ bookingsDown: true }) })).toContain("pose-fixing");
    expect(today({ needs: { status: "error", message: "x" } })).toContain("I could not check what waits for you.");
  });
});

describe("The prepared change and right after (O3, O4)", () => {
  it("shows what changes, what each choice does and exactly one yes", () => {
    const html = decisionView();
    expect(html).toContain("Close online booking for Thanksgiving.");
    expect(html).toContain("Your yes puts it live.");
    expect(html).toContain("If you say yes");
    expect(html).toContain("Thursday, Nov 26: no online times");
    expect(html).toContain("Prepared by North Studio, yesterday");
    expect(html.match(/data-xa-primary/g)).toHaveLength(1);
    expect(html).toContain(">Put it live<");
  });

  it("gives a member a sentence instead of a dead pill, and blocks a yes it cannot show", () => {
    const member = decisionView({ needs: ready({ role: "member" }) });
    expect(member).toContain("Only the owner can decide this.");
    expect(member).not.toContain("data-xa-primary");
    const stale = decisionView({ needs: ready({ items: [decision({ review: null })] }) });
    expect(stale).toContain("This changed or could not be loaded.");
    expect(stale).toMatch(/data-xa-primary="true" disabled=""/);
  });

  it("names more waiting decisions and says so honestly when one is gone", () => {
    expect(decisionView({ needs: ready({ items: [decision(), SECOND_DECISION] }) })).toContain("One more waits after this:");
    expect(decisionView({ selectedId: "d0000000-0000-4000-8000-0000000000ff" })).toContain("This no longer waits for you.");
    expect(decisionView({ needs: ready({ items: [] }) })).toContain("Nothing waits for you.");
  });

  it("after the yes, says what is true, how Strelva knows, and offers Undo only when the receipt allows it", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const node = document.createElement("div"); document.body.append(node);
    const root = createRoot(node);
    const onUndo = vi.fn();
    const live = ready({ items: [], handled: [...SINCE, yesReceipt()] });
    await act(async () => root.render(createElement(OwnerDecisionView, { businessName: HARBOR.name, needs: live, pending: null, notices: { [decision().id]: { tone: "done", text: "Done." } }, initialDecided: decision(), selectedId: decision().id, now: PREVIEW_NOW, onDecide: noop, onUndo, onRetry: noop, onToday: noop, onWhatChanged: noop, onOpenDecision: noop })));
    expect(node.textContent).toContain("It's live.");
    expect(node.textContent).toContain("Strelva read it back at");
    expect(node.textContent).toContain("Who did itNorth Studio");
    await act(async () => [...node.querySelectorAll("button")].find(button => button.textContent === "Undo")!.click());
    expect(onUndo).toHaveBeenCalledWith(yesReceipt());
    await act(async () => root.render(createElement(OwnerDecisionView, { businessName: HARBOR.name, needs: ready({ items: [], handled: [{ ...yesReceipt(), undo: { state: "not_undoable", reason: "Google has it now." } }] }), pending: null, notices: {}, initialDecided: decision(), selectedId: decision().id, now: PREVIEW_NOW, onDecide: noop, onUndo, onRetry: noop, onToday: noop, onWhatChanged: noop, onOpenDecision: noop })));
    expect(node.textContent).toContain("Google has it now.");
    expect([...node.querySelectorAll("button")].some(button => button.textContent === "Undo")).toBe(false);
    await act(async () => root.unmount()); node.remove(); vi.unstubAllGlobals();
  });
});

describe("Requests (O5) and Running (O6)", () => {
  beforeEach(() => undefined);
  afterEach(() => undefined);

  it("groups Requests by who it waits on, with a dot only where someone waits", () => {
    const html = renderToStaticMarkup(createElement(RequestsView, { businessName: HARBOR.name, rows: REQUEST_ROWS, state: { status: "ready" }, readOnly: false, onRetry: noop, onAsk: noop, onOpenWork: noop }));
    expect(html).toContain("What you and North Studio asked for.");
    expect(html).toContain("One waits on you.");
    expect(html).toContain("Open 4");
    expect(html).toContain("Done 2");
    expect(html.match(/data-kind="waits"/g)?.length).toBe(2); // the status dot and its word, one row
    expect(html).not.toContain("Actor not recorded");
  });

  it("counts what Strelva keeps true and marks only the exceptions", () => {
    const holding = renderToStaticMarkup(createElement(RunningChecksView, { data: runningProof(), error: "", busy: false, notice: "", readOnly: false, locked: false, onReload: noop, onCadence: noop, onKeepMeFound: noop }));
    expect(holding).toContain("Seven things Strelva keeps true.");
    expect(holding).toContain("All seven are holding.");
    expect(holding).not.toContain("data-kind=\"down\"");
    const slip = renderToStaticMarkup(createElement(RunningChecksView, { data: runningProof({ slip: true }), error: "", busy: false, notice: "", readOnly: false, locked: false, onReload: noop, onCadence: noop, onKeepMeFound: noop }));
    expect(slip).toContain("One needs a look.");
    expect(slip.match(/Needs a look/g)).toHaveLength(1);
    expect(slip).toContain("pose-fixing");
  });
});

describe("anti-slop, in the rendered markup", () => {
  it("has no mono, no uppercase overlines, no em dashes and no AI selling words on any XA-3 surface", () => {
    const pages = [
      today(), today({ needs: ready({ items: [] }) }), today({ needs: { status: "error", message: "x" } }), today({ systems: [], needs: ready({ items: [], handled: [] }), onBringAgency: noop, gettingStartedHref: "/g" }),
      decisionView(), decisionView({ needs: ready({ role: "member" }) }),
      renderToStaticMarkup(createElement(RequestsView, { businessName: HARBOR.name, rows: REQUEST_ROWS, state: { status: "ready" }, readOnly: false, onRetry: noop, onAsk: noop, onOpenWork: noop })),
      renderToStaticMarkup(createElement(RequestsView, { businessName: HARBOR.name, rows: [], state: { status: "ready" }, readOnly: false, onRetry: noop, onAsk: noop, onOpenWork: noop })),
      renderToStaticMarkup(createElement(RunningChecksView, { data: runningProof({ slip: true }), error: "", busy: false, notice: "", readOnly: false, locked: false, onReload: noop, onCadence: noop, onKeepMeFound: noop })),
    ];
    for (const html of pages) {
      const text = html.replace(/<[^>]+>/g, " ");
      expect(html).not.toMatch(/font-mono|monospace|uppercase|tracking-/);
      expect(text).not.toContain("—");
      expect(text).not.toMatch(/\$—|lorem|seamless|effortless|powerful|unlock|supercharge|magic|AI-powered|Actor not recorded/i);
    }
  });
});
