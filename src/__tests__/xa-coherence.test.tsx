// @vitest-environment jsdom
/**
 * October 16 coherence pass: one yes, one composer, GLOSSARY words, the kit
 * tune and one fixture day for every XA preview.
 */
import { act } from "react";
import { readFileSync } from "node:fs";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { XaYes } from "@/components/ui/strelva/Xa";
import { StComposerBar } from "@/components/ui/strelva/Kit";
import { NeedsYouSection } from "@/experience/workspace/NeedsYouSection";
import type { HandledReceipt, OwnerDecision } from "@/platform/needs-you/contracts";
import { XA_PLACE_LABELS, XA_YES_LABELS } from "@/platform/presentation/place-labels";
import { xaYesLabel } from "@/app/api/approve/xa-page";
import { decisionPresentation } from "@/experience/workspace/needs-you-presentation";
import { XA_CLIENTS, XA_DAY, XA_SYSTEM_HREFS, xaOwnerPinned, xaSearchItems } from "@/experience/workspace/preview/xa-day";
import { XA_MINUTES, XA_CLIENT, xaAgencyClients } from "@/experience/workspace/preview/xa-agency-fixture";

let node: HTMLDivElement;
let root: Root;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); node = document.createElement("div"); document.body.append(node); root = createRoot(node); });
afterEach(async () => { await act(async () => root.unmount()); node.remove(); vi.unstubAllGlobals(); });

const decision: OwnerDecision = {
  id: "d0000000-0000-4000-8000-0000000000c1", workspaceId: "a0000000-0000-4000-8000-0000000000c1", systemId: null, kind: "system.change_live", route: "owner_decides",
  title: "Close online booking for Thanksgiving", detail: null, approveEffect: "Booking closes Nov 26 and 27.", notYetEffect: "Nothing changes.",
  sourceLifecycle: "website_document", sourceId: "fixture", revisionHash: "a".repeat(64), urgent: false, signInRequired: false, adminMayDecide: false,
  openHref: null, state: "open", outcome: null, outcomeReason: null, receiptRef: null, decidedByKind: null, decidedAt: null,
  deliveryState: "suppressed", operatorNote: null, openedAt: "2026-11-22T21:12:00Z", expiresAt: "2026-11-25T21:12:00Z",
  reminded1At: null, reminded2At: null, deliveries: [], review: ["Thu Nov 26: closed", "Fri Nov 27: closed"],
};

describe("one yes", () => {
  it("asks its confirm question inside the yes and confirms with one press", async () => {
    const yes = vi.fn(), back = vi.fn();
    await act(async () => root.render(<XaYes state="waiting" question="Cancel Rachel's booking? This can't be undone here." yesLabel="Cancel booking" notYetLabel="Keep it" onYes={yes} onNotYet={back} shortcut={false} />));
    expect(node.querySelector('[role="group"]')?.textContent).toContain("Cancel Rachel's booking?");
    const buttons = [...node.querySelectorAll("button")];
    expect(buttons.map(button => button.textContent)).toEqual(["Cancel booking", "Keep it"]);
    await act(async () => buttons[0]!.click());
    await act(async () => buttons[0]!.click());
    expect(yes).toHaveBeenCalledTimes(1); expect(back).not.toHaveBeenCalled();
  });

  it("is a click or ⌘↵, never a hold, in Needs you, then offers the receipt's real Undo", async () => {
    const decide = vi.fn(), undo = vi.fn();
    await act(async () => root.render(<NeedsYouSection state={{ status: "ready", role: "owner", items: [decision], complete: true, handled: [], handledAvailable: true }} pending={null} notices={{}} onDecide={decide} onRetry={() => undefined} onUndo={undo} />));
    const pill = node.querySelector<HTMLButtonElement>('button[aria-label="Make it live: Close online booking for Thanksgiving"]')!;
    expect(pill.textContent).toBe("Make it live");
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true })));
    expect(decide).toHaveBeenCalledWith(decision, "approve");
    const receipt: HandledReceipt = { id: `decision:${decision.id}`, store: "needs_you", systemId: null, sentence: "Dr. Lin closed online booking for Thanksgiving", at: "2026-11-23T13:11:00Z", changed: null, evidence: null, undo: { state: "undo" } as HandledReceipt["undo"] };
    await act(async () => root.render(<NeedsYouSection state={{ status: "ready", role: "owner", items: [], complete: true, handled: [receipt], handledAvailable: true }} pending={null} notices={{ [decision.id]: { tone: "done", text: "Done." } }} onDecide={decide} onRetry={() => undefined} onUndo={undo} />));
    await act(async () => node.querySelector<HTMLButtonElement>(`button[aria-label="Undo: ${receipt.sentence}"]`)!.click());
    expect(undo).toHaveBeenCalledWith(receipt);
  });

  it("uses one label set everywhere: no Approve, Put it live or Hold", () => {
    expect(XA_YES_LABELS.yes).toBe("Make it live"); expect(XA_YES_LABELS.notYet).toBe("Not yet");
    for (const kind of [undefined, "money", "access.grant", "system.change_live"]) expect(xaYesLabel(kind, "approve")).toBe("Make it live");
    for (const kind of ["money", "request.scope", "system.go_live", "google.post"] as const) expect(decisionPresentation({ ...decision, kind }).verb).toBe("Make it live");
    expect(decisionPresentation({ ...decision, kind: "customer.commitment", sourceLifecycle: "booking_request" }).verb).toBe("Confirm");
  });
});

describe("one composer", () => {
  it("draws XaComposer for every older StComposerBar caller", async () => {
    await act(async () => root.render(<StComposerBar scope="Harbor Dental" placeholder="Ask about Harbor Dental" value="" onChange={() => undefined} onSubmit={() => undefined} />));
    expect(node.querySelector("textarea[aria-label='Ask Strelva']")).not.toBeNull();
    expect(node.textContent).toContain("Harbor Dental");
    expect(node.querySelectorAll("form")).toHaveLength(1);
  });
});

describe("GLOSSARY words and the kit tune", () => {
  it("names places by GLOSSARY", () => {
    expect(XA_PLACE_LABELS.today).toBe("Home"); expect(XA_PLACE_LABELS.minutes).toBe("Running");
    expect(XA_PLACE_LABELS.agencyMinutes).toBe("Time this month"); expect(XA_PLACE_LABELS.businessRecord).toBe("Business details");
  });
  it("keeps frames at 16 or less, shadows soft and the Working title still", () => {
    const tokens = readFileSync("src/app/styles/workspace-xa.css", "utf8");
    expect(tokens).toMatch(/--st-r-xl: 16px/);
    expect(tokens).not.toMatch(/--st-shadow-(sm|lg): [^;]*(1[3-9]|[2-9]\d)px/);
    const kit = readFileSync("src/components/ui/strelva/xa/xa.module.css", "utf8");
    expect(kit).not.toMatch(/0 10px 30px/);
    expect(kit).not.toMatch(/\.shimmer/);
    expect(readFileSync("src/app/styles/motion.css", "utf8")).not.toMatch(/st-xa-sweep/);
  });
});

describe("one fixture day", () => {
  it("gives every preview the same Systems, links and ⌘K", () => {
    expect(new Date(XA_DAY.now).toISOString()).toBe("2026-11-23T13:14:00.000Z");
    const pinned = xaOwnerPinned();
    expect(pinned.map(item => item.title)).toEqual(["Website", "Bookings", "Inquiries", "New-patient form"]);
    expect(pinned.map(item => item.href)).toEqual(Object.values(XA_SYSTEM_HREFS));
    expect(pinned[3]).toMatchObject({ state: "draft" });
    expect(xaSearchItems("owner").length).toBeGreaterThan(4);
    expect(xaSearchItems("agency").map(item => item.title)).toEqual(expect.arrayContaining(XA_CLIENTS.map(client => client.name)));
  });
  it("keeps the agency's minutes and morning in step with the shared day", () => {
    const minutes = (key: keyof typeof XA_CLIENT) => XA_MINUTES[XA_CLIENT[key]]!.reduce((sum, entry) => sum + entry.minutes, 0);
    expect([minutes("harbor"), minutes("north"), minutes("lakeview"), minutes("fieldwork")]).toEqual([96, 74, 39, 22]);
    const page = xaAgencyClients("ready");
    expect(page.clients.map(client => client.name)).toEqual(expect.arrayContaining(XA_CLIENTS.map(client => client.name)));
    expect(page.queue.every(item => item.since.startsWith("2026-11-2"))).toBe(true);
  });
});
