// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerToday } from "@/experience/workspace/today/OwnerToday";
import { OwnerDecisionView } from "@/experience/workspace/today/OwnerDecisionView";
import { RequestsView } from "@/experience/workspace/today/OwnerRequests";
import { RunningChecksView } from "@/experience/workspace/today/OwnerRunning";
import { afterYesQuiet, decisionHeadline, greetingName, liveHeadline, nowTrue, previewLabel, sinceLines, todayGreeting, todayLede, yesLabel, yesPhase } from "@/experience/workspace/today/today-model";
import { businessRequestRows, deliveryProviderName, withDecisions } from "@/experience/workspace/WorkspaceRequests";
import { actorPresentation, actorShortName } from "@/platform/presentation/actor";
import { withCheckHistory } from "@/platform/work-execution/responsibility-proof";
import type { NeedsYouState } from "@/experience/workspace/useNeedsYou";
import { HARBOR, NEXT_CHECK_MANDATE, PREVIEW_NOW, SECOND_DECISION, SINCE, STRELVA_JOB_ROW, SYSTEM_IDS, decision, harborDeliveries, harborSystems, runningProof, yesReceipt } from "@/experience/workspace/preview/xa-owner-today-fixture";

const noop = () => undefined;
const ready = (over: Partial<Extract<NeedsYouState, { status: "ready" }>> = {}): NeedsYouState => ({ status: "ready", role: "owner", items: [decision()], complete: true, handled: SINCE, handledAvailable: true, ...over });
const MINUTE = Math.floor(PREVIEW_NOW / 60_000);
const today = (over: Partial<Parameters<typeof OwnerToday>[0]> = {}) => renderToStaticMarkup(createElement(OwnerToday, {
  businessName: HARBOR.name, ownerName: greetingName(HARBOR.accountName), minute: MINUTE, now: PREVIEW_NOW, needs: ready(), notices: {}, systems: harborSystems(),
  onAsk: noop, onReview: noop, onAllWaiting: noop, onRetry: noop, onWhatChanged: noop, systemHref: id => `/s/${id}`, ...over,
}));
const requestRows = (needs: NeedsYouState = ready({ items: [], handled: [...SINCE, yesReceipt()] }), thanksgivingWaits = false) =>
  withDecisions([...businessRequestRows(harborDeliveries({ thanksgivingWaits }), [], item => deliveryProviderName(item, new Map()), { viewerName: HARBOR.accountName }), STRELVA_JOB_ROW], needs);
const SYSTEM_KINDS = [...harborSystems().map(entry => ({ id: entry.id, kind: entry.kind })), { id: SYSTEM_IDS.form, kind: "form" }];
const running = (over: Partial<Parameters<typeof RunningChecksView>[0]> = {}) => renderToStaticMarkup(createElement(RunningChecksView, { data: runningProof(), error: "", busy: false, notice: "", readOnly: false, locked: false, now: PREVIEW_NOW, onReload: noop, onCadence: noop, onKeepMeFound: noop, ...over }));
const decisionView = (over: Partial<Parameters<typeof OwnerDecisionView>[0]> = {}) => renderToStaticMarkup(createElement(OwnerDecisionView, {
  businessName: HARBOR.name, needs: ready(), pending: null, notices: {}, systems: harborSystems(), now: PREVIEW_NOW,
  onDecide: noop, onUndo: noop, onRetry: noop, onToday: noop, onWhatChanged: noop, onOpenDecision: noop, ...over,
}));

describe("XA-3 words and states", () => {
  it("greets by recorded name only, and never claims a time of day without a clock", () => {
    expect(todayGreeting(null, "Dr. Lin")).toBe("Welcome back, Dr. Lin.");
    expect(todayGreeting(MINUTE, null)).toMatch(/^Good (morning|afternoon|evening)\.$/);
    // The real route passes the account's recorded name through greetingName, as the preview does.
    expect(greetingName("Dr. Amy Lin")).toBe("Dr. Lin");
    expect(greetingName("Amy Lin")).toBe("Amy");
    expect(greetingName("  ")).toBeNull();
  });

  it("says exceptions first and claims nothing about decisions it did not read", () => {
    const systems = harborSystems();
    expect(todayLede({ waiting: 0, canDecide: true, systems, unchecked: false })).toBe(`Nothing needs you. Everything passed its checks at ${new Date(systems[0]!.health.lastVerifiedAt!).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase().replace(/\s?am$/, "").replace(/\s?pm$/, " pm")}.`);
    expect(todayLede({ waiting: 1, canDecide: false, systems, unchecked: false })).toMatch(/^One thing waits for the owner\. The rest passed their checks/);
    expect(todayLede({ waiting: 0, canDecide: true, systems: harborSystems({ bookingsDown: true }), unchecked: false })).toBe("Bookings failed its check at 6:40.");
    expect(todayLede({ waiting: 0, canDecide: true, systems, unchecked: false, decisionsKnown: false })).not.toContain("Nothing needs you");
    expect(todayLede({ waiting: 0, canDecide: true, systems, unchecked: true })).not.toContain("Nothing needs you");
  });

  it("dates older changes instead of calling them since yesterday when there is no clock", () => {
    expect(sinceLines(SINCE, null).every(line => !line.recent && /^[A-Z][a-z]{2} \d+$/.test(line.time))).toBe(true);
    const lines = sinceLines(SINCE, PREVIEW_NOW);
    expect(lines.every(line => line.recent)).toBe(true);
    // Newest first, and yesterday's line says so.
    expect(lines.map(line => line.time)).toEqual(["6:40", "6:12", "Yesterday 4:12 pm"]);
  });

  it("uses the board's yes words and the decision's own verbs", () => {
    // GLOSSARY words: Make it live; a "Hold to" verb reads without the hold (the XA yes is a press).
    expect(yesLabel(decision())).toBe("Make it live");
    expect(yesLabel(decision({ kind: "customer.message" }))).toBe("Send");
    expect(yesLabel(decision({ kind: "money", sourceLifecycle: "booking_request" }))).toBe("Confirm");
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
  });

  it("names whoever acted, the person at their agency, in the past tense", () => {
    expect(actorPresentation(decision().actor).name).toBe("Maya at North Studio");
    expect(actorShortName(decision().actor)).toBe("Maya");
    expect(actorPresentation({ kind: "agency", displayName: "North Studio" }).name).toBe("North Studio");
    expect(decisionHeadline(decision())).toBe("Maya at North Studio closed online booking for Thanksgiving.");
    expect(decisionHeadline(decision({ actor: null }))).toBe("Close online booking for Thanksgiving.");
    expect(decisionHeadline(decision({ title: "Booking request: Ana R." }))).toBe("Booking request: Ana R..".replace("..", "."));
  });

  it("after the yes, names the thing and folds the read-back into one sentence", () => {
    expect(liveHeadline(decision(), "Bookings", true)).toBe("Online booking is closed for Thanksgiving.");
    expect(liveHeadline(decision({ title: "Update hours on Google" }), null, true)).toBe("Hours are updated on Google.");
    expect(liveHeadline(decision({ title: "Booking request: Ana R." }), "Bookings", true)).toBe("It's live on Bookings.");
    expect(afterYesQuiet(yesReceipt(), "page")).toBe("Strelva read the page back at 8:11.");
    expect(nowTrue(yesReceipt())).toEqual(["Thursday and Friday show Closed on harbordental.com/book", "No open times on Nov 26 and 27", "Saturday stays 9 to 1"]);
    expect(previewLabel("waiting", "patients")).toBe("What patients will see");
    expect(previewLabel("live", "patients")).toBe("What patients see now");
    expect(previewLabel("undone", "patients")).toBe("Back to how it was");
  });
});

describe("Today (O1, O2)", () => {
  it("docks the one waiting item on the composer with whoever prepared it", () => {
    const html = today();
    expect(html).toContain("Good morning, Dr. Lin.");
    expect(html).toContain("Waits for you · from Maya at North Studio");
    expect(html).toContain('aria-label="Review: Close online booking for Thanksgiving"');
    expect(html).not.toContain("data-xa-primary");
  });

  it("is a normal morning with what changed beside Pebble when nothing waits", () => {
    const html = today({ needs: ready({ items: [] }) });
    expect(html).toContain("Nothing needs you.");
    expect(html).toContain("Since yesterday");
    expect(html).toContain("Strelva renewed the security certificate for harbordental.com.");
    expect(html).toContain("pose-resting");
    // Phone rows: one check time above the list, no status on rows that are fine.
    expect(html).toContain("Running for you, checked at 7:02");
    expect(html).not.toContain("Checks passed at");
  });

  it("tells a member the item waits for the owner, and a shared reader gets no composer", () => {
    expect(today({ needs: ready({ role: "member" }) })).toContain("Waits for the owner · from Maya at North Studio");
    const shared = today({ readOnly: true, readOnlyNote: "Harbor Dental shared this with your agency to review." });
    expect(shared).not.toContain("<textarea");
    expect(shared).toContain("Harbor Dental shared this with your agency to review.");
  });

  it("puts Pebble in frame, fixing, for bad news", () => {
    const down = today({ needs: ready({ items: [] }), systems: harborSystems({ bookingsDown: true }), onRunning: noop, onOpenSystem: noop });
    expect(down).toContain("pose-fixing");
    expect(down).toContain("Bookings failed its check at 6:40.");
    expect(down).toContain("Pebble is on Bookings");
    expect(down).toContain("The booking page stopped loading at 6:40.");
    expect(down).toMatch(/See it<\/button>.*Running<\/button>/);
    expect(today({ needs: { status: "error", message: "x" } })).toContain("I could not check what waits for you.");
  });
});

describe("The prepared change and right after (O3, O4)", () => {
  it("shows what changes, what each choice does and exactly one yes", () => {
    const html = decisionView();
    expect(html).toContain("Maya at North Studio closed online booking for Thanksgiving.");
    expect(html).toContain("Your yes makes it live.");
    expect(html).toContain("If you say yes");
    // The dominant element: the booking page as patients will see it.
    expect(html).toContain("What patients will see");
    expect(html).toContain("harbordental.com/book");
    expect(html).toContain("Book a visit");
    expect(html.match(/>Closed</g)).toHaveLength(2);
    expect(html).toContain("Thursday, Nov 26: no online times");
    expect(html).not.toContain("what changes");
    expect(html).toContain("Prepared by Maya, yesterday 4:12 pm");
    expect(html.match(/data-xa-primary/g)).toHaveLength(1);
    expect(html).toContain(">Make it live<");
    expect(decisionView({ onAsk: noop })).toContain("Ask for a different change");
  });

  it("gives a member a sentence instead of a dead pill, and blocks a yes it cannot show", () => {
    const member = decisionView({ needs: ready({ role: "member" }) });
    expect(member).toContain("Only the owner can decide this.");
    expect(member).not.toContain("data-xa-primary");
    const stale = decisionView({ needs: ready({ items: [decision({ review: null })] }) });
    expect(stale).toContain("This changed or could not be loaded.");
    expect(stale).not.toContain("data-xa-primary");
    expect(stale).toContain("Check again");
  });

  it("names more waiting decisions and says so honestly when one is gone", () => {
    expect(decisionView({ needs: ready({ items: [decision(), SECOND_DECISION] }) })).toContain("One more waits after this:");
    expect(decisionView({ selectedId: "d0000000-0000-4000-8000-0000000000ff" })).toContain("This no longer waits for you.");
    expect(decisionView({ needs: ready({ items: [] }) })).toContain("Nothing waits for you.");
  });

  it("falls back to flat change lines when a decision has no preview", () => {
    const html = decisionView({ needs: ready({ items: [SECOND_DECISION] }) });
    expect(html).toContain("What your yes changes");
    expect(html).toContain("Insurance we take: Cigna, MetLife, Delta Dental (new)");
  });

  it("after a turn-on with no one-tap undo, offers Roll it back, which asks Strelva for it", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const node = document.createElement("div"); document.body.append(node);
    const root = createRoot(node);
    const onAsk = vi.fn();
    const receipt = { ...yesReceipt(), undo: { state: "undo_needs_review" as const, reason: "Rolling it back is its own change. Ask Strelva and it rolls back step by step." } };
    await act(async () => root.render(createElement(OwnerDecisionView, { businessName: HARBOR.name, needs: ready({ items: [], handled: [...SINCE, receipt] }), pending: null, notices: { [decision().id]: { tone: "done", text: "Done." } }, initialDecided: decision(), selectedId: decision().id, now: PREVIEW_NOW, onDecide: noop, onUndo: noop, onRetry: noop, onToday: noop, onWhatChanged: noop, onOpenDecision: noop, onAsk })));
    expect([...node.querySelectorAll("button")].some(button => button.textContent === "Undo")).toBe(false);
    await act(async () => [...node.querySelectorAll("button")].find(button => button.textContent === "Roll it back")!.click());
    expect(onAsk).toHaveBeenCalledWith(expect.stringContaining("Roll back"));
    await act(async () => root.unmount());
  });

  it("after the yes, says what is true, how Strelva knows, and offers Undo only when the receipt allows it", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const node = document.createElement("div"); document.body.append(node);
    const root = createRoot(node);
    const onUndo = vi.fn();
    const live = ready({ items: [], handled: [...SINCE, yesReceipt()] });
    await act(async () => root.render(createElement(OwnerDecisionView, { businessName: HARBOR.name, needs: live, pending: null, notices: { [decision().id]: { tone: "done", text: "Done." } }, initialDecided: decision(), selectedId: decision().id, now: PREVIEW_NOW, onDecide: noop, onUndo, onRetry: noop, onToday: noop, onWhatChanged: noop, onOpenDecision: noop })));
    expect(node.textContent).toContain("Online booking is closed for Thanksgiving. Strelva read the page back at 8:11.");
    // The read-back time is said once, in the subhead.
    expect(node.textContent?.match(/back at 8:11/g)).toHaveLength(1);
    expect(node.textContent).toContain("What patients see now");
    expect(node.textContent).toContain("Thursday and Friday show Closed on harbordental.com/book");
    expect(node.textContent).toContain("Prepared byMaya at North Studio");
    // No process trail, no builder words, and the composer belongs to the waiting state only.
    expect(node.textContent).not.toMatch(/What Strelva checked|Accepted where it lives|Your yes is recorded|Recorded without a name|still recording/);
    expect(node.querySelector("textarea")).toBeNull();
    await act(async () => [...node.querySelectorAll("button")].find(button => button.textContent === "Undo")!.click());
    expect(onUndo).toHaveBeenCalledWith(yesReceipt());
    await act(async () => root.render(createElement(OwnerDecisionView, { businessName: HARBOR.name, needs: ready({ items: [], handled: [...SINCE, yesReceipt("undone")] }), pending: null, notices: {}, initialDecided: decision(), selectedId: decision().id, now: PREVIEW_NOW, onDecide: noop, onUndo, onRetry: noop, onToday: noop, onWhatChanged: noop, onOpenDecision: noop })));
    expect(node.textContent).toContain("You took it back.");
    expect(node.textContent).toContain("Undone byYou");
    expect(node.textContent).toContain("Back to how it was");
    expect(node.textContent).not.toContain("Already undone");
    await act(async () => root.render(createElement(OwnerDecisionView, { businessName: HARBOR.name, needs: ready({ items: [], handled: [{ ...yesReceipt(), undo: { state: "not_undoable", reason: "Google has it now." } }] }), pending: null, notices: {}, initialDecided: decision(), selectedId: decision().id, now: PREVIEW_NOW, onDecide: noop, onUndo, onRetry: noop, onToday: noop, onWhatChanged: noop, onOpenDecision: noop })));
    expect(node.textContent).toContain("Google has it now.");
    expect([...node.querySelectorAll("button")].some(button => button.textContent === "Undo")).toBe(false);
    await act(async () => root.unmount()); node.remove(); vi.unstubAllGlobals();
  });
});

describe("Requests (O5) and Running (O6)", () => {
  beforeEach(() => undefined);
  afterEach(() => undefined);

  it("leads each Request with its System's clay, says who asked and who is doing it, and marks only exceptions", () => {
    const html = renderToStaticMarkup(createElement(RequestsView, { businessName: HARBOR.name, rows: requestRows(), systems: SYSTEM_KINDS, state: { status: "ready" }, readOnly: false, onRetry: noop, onAsk: noop, onOpenWork: noop, onUndo: noop }));
    expect(html).toContain("What you and North Studio asked for.");
    expect(html).toContain("Nothing waits on you.");
    expect(html).toContain("Open 4");
    expect(html).toContain("Maya at North Studio asked Nov 12 · North Studio is making it, due Nov 27");
    expect(html).toContain("You asked Nov 9 · North Studio is making it");
    expect(html).toContain("system-form.webp");
    expect(html).toContain("system-website.webp");
    expect(html).not.toMatch(/In progress|Being made</);
    expect(html).not.toContain('data-kind="waits"');
    expect(html).not.toMatch(/Actor not recorded|your agency/);
    expect(html).toContain("Ask for something new");
  });

  it("opens the decision a Request waits on, and undoes a done Request through its decision receipt", async () => {
    const waits = ready({ items: [decision()] });
    const waiting = renderToStaticMarkup(createElement(RequestsView, { businessName: HARBOR.name, rows: requestRows(waits, true), systems: SYSTEM_KINDS, state: { status: "ready" }, readOnly: false, onRetry: noop, onAsk: noop, onOpenWork: noop, onReview: noop }));
    expect(waiting).toContain("One waits on you.");
    expect(waiting).toContain('aria-label="Review: Close online booking for Thanksgiving"');
    expect(waiting.match(/data-kind="waits"/g)?.length).toBe(2); // the dot and its word, one row
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const node = document.createElement("div"); document.body.append(node);
    const root = createRoot(node);
    const onUndo = vi.fn();
    await act(async () => root.render(createElement(RequestsView, { businessName: HARBOR.name, rows: requestRows(), systems: SYSTEM_KINDS, state: { status: "ready" }, readOnly: false, onRetry: noop, onAsk: noop, onOpenWork: noop, onUndo, initialView: "done" })));
    await act(async () => (node.querySelector('[aria-label="Undo: Close online booking for Thanksgiving"]') as HTMLButtonElement).click());
    expect(onUndo).toHaveBeenCalledWith(yesReceipt());
    expect(node.querySelectorAll('[aria-label^="Undo:"]')).toHaveLength(1);
    await act(async () => root.unmount()); node.remove(); vi.unstubAllGlobals();
  });

  it("counts what Strelva keeps true around a thirty-day strip, with value and time columns", () => {
    const holding = running();
    expect(holding).toContain("Seven things Strelva keeps true.");
    expect(holding).toContain("All seven are holding.");
    expect(holding.match(/data-state="(held|slipped|none)"/g)).toHaveLength(30);
    expect(holding.match(/data-state="slipped"/g)).toHaveLength(1);
    expect(holding).toContain("One slip in 30 days. Nov 3: new-patient forms reach hello@harbordental.com.");
    expect(holding).toContain(">41 of 41<");
    expect(holding).toContain(">8:11</time>");
    expect(holding).toContain("Next check at 1:00 pm");
    expect(holding).toContain("pose-lineup");
    expect(holding).not.toMatch(/data-kind="down"|agency's schedule|Reload proof/);
  });

  it("puts the bad news first, with Pebble on it, and keeps one ink pill when Keep me found is offered", () => {
    const slip = running({ data: runningProof({ slip: true }) });
    expect(slip).toContain("One needs a look.");
    expect(slip).toContain("New-patient forms reach hello@harbordental.com did not hold at 6:00: bounced.");
    expect(slip.indexOf("did not hold at 6:00")).toBeLessThan(slip.indexOf("harbordental.com opens in under 2 seconds"));
    expect(slip).toContain("Pebble is on it");
    expect(slip).toContain("pose-fixing");
    const offer = running({ data: { ...runningProof(), state: { ...runningProof().state, mandates: [NEXT_CHECK_MANDATE, { ...NEXT_CHECK_MANDATE, serviceRequestId: "e0000000-0000-4000-8000-000000000002" }] } } });
    expect(offer.match(/data-xa-primary/g)).toHaveLength(1);
  });

  it("records check history only from observations", () => {
    const base = runningProof().proof.cards[0]!;
    const card = withCheckHistory({ ...base, checkDays: [], slipDays: [], lastSlipAt: null, checkedAt: null }, [{ at: "2026-11-20T15:00:00Z", held: true }, { at: "2026-11-21T15:00:00Z", held: false }, { at: "bad", held: true }]);
    expect(card.checkDays).toEqual(["2026-11-20", "2026-11-21"]);
    expect(card.slipDays).toEqual(["2026-11-21"]);
    expect(card.checkedAt).toBe("2026-11-21T15:00:00Z");
    expect(card.lastSlipAt).toBe("2026-11-21T15:00:00Z");
  });
});

describe("anti-slop, in the rendered markup", () => {
  it("has no mono, no uppercase overlines, no em dashes and no AI selling words on any XA-3 surface", () => {
    const pages = [
      today(), today({ needs: ready({ items: [] }) }), today({ needs: { status: "error", message: "x" } }), today({ systems: [], needs: ready({ items: [], handled: [] }), onBringAgency: noop, gettingStartedHref: "/g" }),
      decisionView(), decisionView({ needs: ready({ role: "member" }) }),
      renderToStaticMarkup(createElement(RequestsView, { businessName: HARBOR.name, rows: requestRows(), systems: SYSTEM_KINDS, state: { status: "ready" }, readOnly: false, onRetry: noop, onAsk: noop, onOpenWork: noop })),
      renderToStaticMarkup(createElement(RequestsView, { businessName: HARBOR.name, rows: [], state: { status: "ready" }, readOnly: false, onRetry: noop, onAsk: noop, onOpenWork: noop })),
      running({ data: runningProof({ slip: true }) }), running(),
    ];
    for (const html of pages) {
      const text = html.replace(/<[^>]+>/g, " ");
      expect(html).not.toMatch(/font-mono|monospace|uppercase|tracking-/);
      expect(text).not.toContain("—");
      expect(text).not.toMatch(/\$—|lorem|seamless|effortless|powerful|unlock|supercharge|magic|AI-powered|Actor not recorded|Recorded without a name|Accepted where it lives|Reload proof|your agency's schedule/i);
    }
  });
});
