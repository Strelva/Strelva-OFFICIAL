import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined }), usePathname: () => "/workspace", useSearchParams: () => new URLSearchParams() }));
import { BusinessHome } from "@/experience/workspace/BusinessHome";
import { NeedsYouSection, StrelvaHandledSection } from "@/experience/workspace/NeedsYouSection";
import type { NeedsYouState } from "@/experience/workspace/useNeedsYou";
import type { HandledReceipt, OwnerDecision } from "@/platform/needs-you/contracts";
import type { WorkspaceSnapshot } from "@/experience/workspace/contracts";

const noop = () => undefined;
const item = (over: Partial<OwnerDecision> = {}): OwnerDecision => ({
  id: "d0000000-0000-4000-8000-000000000001", workspaceId: "a0000000-0000-4000-8000-000000000001", systemId: null, kind: "customer.commitment", route: "owner_decides",
  title: "Reply to Jordan quoting the consult fee", detail: "An initial consultation is $150.", approveEffect: "The reply sends.", notYetEffect: "Nothing sends.",
  sourceLifecycle: "tenant_event", sourceId: "t:e", revisionHash: "a".repeat(64), urgent: true, signInRequired: false, adminMayDecide: true, openHref: null,
  state: "open", outcome: null, outcomeReason: null, receiptRef: null, decidedByKind: null, decidedAt: null, deliveryState: "suppressed", operatorNote: null,
  openedAt: "2026-10-06T11:00:00Z", expiresAt: "2026-10-20T11:00:00Z", reminded1At: null, reminded2At: null, deliveries: [], ...over,
});
const receipts: HandledReceipt[] = [
  { id: "record:14", store: "business_record_revisions", systemId: null, sentence: "Strelva updated your hours in your business record", at: "2026-10-06T14:10:00Z", changed: "hours", evidence: null, undo: { state: "undo" } },
  { id: "tenant_event:9", store: "tenant_events", systemId: null, sentence: "Strelva replied to Dana's review on Google", at: "2026-10-05T21:02:00Z", changed: null, evidence: { providerAccepted: true, readBack: "verified" }, undo: { state: "not_undoable", reason: "Google has the reply; delete it on Google." } },
];
const ready = (over: Partial<Extract<NeedsYouState, { status: "ready" }>> = {}): NeedsYouState => ({ status: "ready", role: "owner", items: [item()], complete: true, handled: receipts, handledAvailable: true, ...over });
const needs = (state: NeedsYouState, extra?: { extraCount?: number }) => renderToStaticMarkup(createElement(NeedsYouSection, { state, pending: null, notices: {}, onDecide: noop, onRetry: noop, ...extra }));
const handled = (state: NeedsYouState) => renderToStaticMarkup(createElement(StrelvaHandledSection, { state, pending: null, notices: {}, onUndo: noop }));

describe("Needs you on Home", () => {
  it("shows each owner decision with Approve and Not yet and what each does", () => {
    const html = needs(ready({ items: [item(), item({ id: "d0000000-0000-4000-8000-000000000002", title: "Put the booking page live", openHref: "/workspace?view=apps" })] }));
    expect(html).toContain("Reply to Jordan quoting the consult fee");
    expect(html).toContain("Approve: The reply sends. Not yet: Nothing sends.");
    expect(html).toContain('aria-label="Approve: Reply to Jordan quoting the consult fee"');
    expect(html).toContain('aria-label="Not yet: Put the booking page live"');
    expect(html).toContain('href="/workspace?view=apps"');
    expect(html).toContain(">2</span>");
  });

  it("is gone when nothing needs the owner", () => {
    expect(needs(ready({ items: [] }))).toBe("");
    expect(needs({ status: "disabled" })).toBe("");
  });

  it("lets a member see but not decide", () => {
    const html = needs(ready({ role: "member" }));
    expect(html).toContain("Only the owner can decide these.");
    expect(html).not.toContain("Approve: Reply");
  });

  it("has honest loading and error states", () => {
    expect(needs({ status: "loading" })).toContain("Checking what needs you");
    expect(needs({ status: "error", message: "Your decisions could not be checked. Nothing about them changed." })).toContain("Check again");
  });
});

describe("Strelva handled on Home", () => {
  it("lists receipts with Strelva as the subject and undo only where it is one tap", () => {
    const html = handled(ready());
    expect(html).toContain("Strelva updated your hours in your business record");
    expect(html).toContain('aria-label="Undo: Strelva updated your hours in your business record"');
    expect(html).toContain("Google has the reply; delete it on Google.");
    expect(html).not.toContain('aria-label="Undo: Strelva replied');
    expect(html).toContain("Confirmed live");
  });

  it("never offers undo to a member, and says when receipts can't load", () => {
    expect(handled(ready({ role: "member" }))).not.toContain("Undo:");
    expect(handled(ready({ handledAvailable: false, handled: [] }))).toContain("could not be loaded");
    expect(handled(ready({ handled: [] }))).toContain("Nothing this week.");
  });
});

describe("BusinessHome with the Needs you release", () => {
  const snapshot = (needsYou: boolean): WorkspaceSnapshot => ({
    actor: { email: "owner@alder.example", localPreview: true },
    workspaces: [{ id: "a0000000-0000-4000-8000-000000000001", kind: "customer", name: "Alder Workshop", role: "owner" }],
    workspaceId: "a0000000-0000-4000-8000-000000000001", work: [], handoffs: [], delegations: [], products: [],
    releases: { systems: false, needsYou },
  } as unknown as WorkspaceSnapshot);
  const render = (needsYou: boolean) => renderToStaticMarkup(createElement(BusinessHome, {
    snapshot: snapshot(needsYou), sites: [], unassignedSites: [], siteAssignmentsKnown: true, offerings: { status: "unavailable", reason: "x" }, busy: false,
    onOpen: noop, onStart: noop, onRequest: noop, onNavigate: noop, onWorkspace: noop, onOfferings: noop, accountHref: "/workspace/account",
  }));

  it("reads Needs you and Strelva handled from the policy model when on", () => {
    const html = render(true);
    expect(html).toContain("Checking what needs you");
    expect(html).toContain("Checking what Strelva did");
  });

  it("renders Home exactly as before when off", () => {
    const html = render(false);
    expect(html).not.toContain("Checking what needs you");
    expect(html).toContain("Needs you");
  });
});

describe("Needs you, October 6 shapes", () => {
  it("names the one primary action for the decision while its effect stays visible", async () => {
    const { decisionPresentation, decisionCount } = await import("@/experience/workspace/needs-you-presentation");
    expect(decisionPresentation(item()).verb).toBe("Approve");
    expect(decisionPresentation(item()).amount).toBe("$150");
    expect(decisionPresentation(item()).shape).toBe("price");
    expect(decisionPresentation(item({ kind: "system.go_live", detail: null, sourceLifecycle: "website_document" }))).toMatchObject({ verb: "Make it live", shape: "live", source: "Website", amount: null });
    expect(decisionPresentation(item({ kind: "google.post", detail: "\"Tip of the week\"" }))).toMatchObject({ verb: "Post it", shape: "message", source: "Google" });
    expect(decisionPresentation(item({ sourceLifecycle: "booking_request", detail: "Thu 10:30" }))).toMatchObject({ verb: "Confirm", source: "Bookings" });
    // A price only comes from the decision's own words.
    expect(decisionPresentation(item({ title: "Reply to Jordan", detail: "Happy to help." })).amount).toBeNull();
    expect(decisionCount(3)).toBe("Three decisions");
    expect(decisionCount(1)).toBe("One decision");
    expect(decisionCount(12)).toBe("12 decisions");
  });

  it("deals each decision as a card with its price, effects and actions", () => {
    const html = renderToStaticMarkup(createElement(NeedsYouSection, { state: ready({ items: [item(), item({ id: "d0000000-0000-4000-8000-000000000002", kind: "system.go_live", title: "Put the booking page live", detail: null, openHref: "/workspace?view=apps" })] }), pending: null, notices: {}, onDecide: noop, onRetry: noop, variant: "deck" }));
    expect(html).toContain("$150</p>");
    expect(html).toContain('data-shape="price"');
    expect(html).toContain('data-shape="live"');
    expect(html).toContain('aria-label="Make it live: Put the booking page live"');
    expect(html).toContain('aria-label="Not yet: Put the booking page live"');
    expect(html).toContain("Approve: The reply sends. Not yet: Nothing sends.");
  });

  it("says so honestly when nothing needs the owner and the caller asks for an empty state", () => {
    const html = renderToStaticMarkup(createElement(NeedsYouSection, { state: ready({ items: [] }), pending: null, notices: {}, onDecide: noop, onRetry: noop, empty: createElement("p", null, "Nothing needs you right now.") }));
    expect(html).toContain("Nothing needs you right now.");
    expect(html).not.toContain("Approve:");
  });

  it("tells a member the decisions wait on the owner", () => {
    expect(needs(ready({ role: "member" }))).toContain("One decision waiting on the owner.");
    expect(needs(ready())).toContain("One decision waiting on you.");
  });
});

describe("The Needs you place", () => {
  const snapshot = {
    actor: { email: "owner@alder.example", localPreview: true },
    workspaces: [{ id: "a0000000-0000-4000-8000-000000000001", kind: "customer", name: "Alder Workshop", role: "owner" }],
    workspaceId: "a0000000-0000-4000-8000-000000000001", work: [], handoffs: [], delegations: [], products: [],
    releases: { systems: false, needsYou: true },
  } as unknown as WorkspaceSnapshot;
  const props = { snapshot, sites: [], unassignedSites: [], siteAssignmentsKnown: true, offerings: { status: "unavailable" as const, reason: "x" }, busy: false,
    onOpen: noop, onStart: noop, onRequest: noop, onNavigate: noop, onWorkspace: noop, onOfferings: noop, accountHref: "/workspace/account" };

  it("opens as its own page with the place selected in the sidebar", () => {
    const html = renderToStaticMarkup(createElement(BusinessHome, { ...props, view: "needs-you" }));
    expect(html).toContain("<h1 class=\"font-display\">Needs you</h1>");
    expect(html).toContain("Checking what needs you");
    expect(html).toMatch(/aria-current="page" href="\/workspace\?view=needs-you&amp;workspaceId=/);
    expect(html).not.toContain("Good morning");
  });

  it("is Home, with no Needs you place, while the release is off", () => {
    const html = renderToStaticMarkup(createElement(BusinessHome, { ...props, snapshot: { ...snapshot, releases: { systems: false, needsYou: false } }, view: "needs-you" }));
    expect(html).not.toContain("view=needs-you");
    expect(html).toContain("id=\"business-start-title\"");
  });
});
