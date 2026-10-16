// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SystemPage } from "@/experience/systems/SystemPage";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
import { WorkspaceBookings } from "@/experience/bookings/WorkspaceBookings";
import { WorkspaceInquiries } from "@/experience/places/WorkspaceInquiries";
import { XA4_INBOX, XA4_SITE, XA4_WORKSPACE, harborBookingRequestDecision, harborBookings, harborForm, harborInbox, harborLeads, harborPossibility, harborWebsite, harborWebsiteDetail } from "@/experience/workspace/preview/xa4-systems-fixture";
import { ownerDecisionSchema } from "@/platform/needs-you/contracts";
import { BookingRequestYes } from "@/experience/bookings/BookingRequestYes";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));

const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });

async function mount(element: React.ReactElement, request: typeof fetch) {
  const node = document.createElement("div"); document.body.append(node);
  const root = createRoot(node); roots.push(root);
  await act(async () => root.render(createElement(WorkspaceRequestContext.Provider, { value: request }, element)));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  return node;
}
const base = { workspaceId: XA4_WORKSPACE, readOnly: false, canMakeReal: true, sources: [], systemHref: (id: string) => `/systems/${id}`, onHome: () => undefined, onAsk: () => undefined };
const button = (node: HTMLElement, text: string) => [...node.querySelectorAll("button")].find(item => item.textContent?.replace("⌘↵", "").trim() === text);
const detailFetch = (extra?: (url: string, init?: RequestInit) => Response | undefined) => vi.fn<typeof fetch>(async (input, init) => {
  const url = String(input);
  return extra?.(url, init) ?? (url.startsWith("/api/workspace/systems/website?") ? Response.json({ detail: harborWebsiteDetail("full") }) : Response.json({ error: "unexpected" }, { status: 500 }));
});

describe("XA · S5 A Possibility", () => {
  it("compares live and proposed, and puts it live through the same Make real call with one yes", async () => {
    const request = detailFetch(url => url === "/api/workspace/systems/make-real" ? Response.json({ live: { live: true, status: "done", headline: "Live on harbordental.com", activationId: "a1" } }) : undefined);
    const site = harborWebsite("waiting");
    const node = await mount(createElement(SystemPage, { ...base, system: site, systems: [site], initialPossibilityId: site.possibilities[0]!.id }), request);
    expect(node.textContent).toContain("Put booking at the top of your home page.");
    expect(node.textContent).toContain("A Possibility from Maya at North Studio · Nov 21");
    expect(node.textContent).toContain("Your site stays as it is until you say yes.");
    expect(node.textContent).not.toContain("Put it live");
    expect(node.querySelectorAll("iframe")).toHaveLength(2);
    expect(node.querySelectorAll("[data-xa-primary]")).toHaveLength(1);
    await act(async () => button(node, "Make it live")!.click());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    const call = request.mock.calls.find(([url]) => url === "/api/workspace/systems/make-real")!;
    expect(JSON.parse(String(call[1]!.body))).toEqual({ workspaceId: XA4_WORKSPACE, possibilityId: site.possibilities[0]!.id, executionMode: "live" });
    expect(node.textContent).toContain("Live on harbordental.com");
  });

  it("asks for a reload instead of a retry when the answer is lost", async () => {
    const request = detailFetch(url => url === "/api/workspace/systems/make-real" ? Response.json({ error: "harbordental.com did not answer." }, { status: 502 }) : undefined);
    const site = harborWebsite("waiting");
    const node = await mount(createElement(SystemPage, { ...base, system: site, systems: [site], initialPossibilityId: site.possibilities[0]!.id }), request);
    await act(async () => button(node, "Make it live")!.click());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(node.querySelector("[role=alert]")?.textContent).toContain("Reload this System");
    expect([...node.querySelectorAll("a")].find(link => link.textContent === "Reload now")?.getAttribute("href")).toBe(`/systems/${XA4_SITE}`);
    expect(button(node, "Try again")).toBeUndefined();
  });

  it("blocks the yes for someone who is not the owner and says why", async () => {
    const site = { ...harborWebsite("waiting"), possibilities: [harborPossibility()] };
    const html = renderToStaticMarkup(createElement(SystemPage, { ...base, readOnly: true, canMakeReal: false, ownerName: "Dr. Lin", system: site, systems: [site], initialPossibilityId: site.possibilities[0]!.id, websiteDetail: { status: "ready", detail: harborWebsiteDetail("full") } }));
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[^]*?Make it live/);
    expect(html).toContain("Only Dr. Lin can say yes to this.");
    expect(html).not.toContain("possibility real");
  });
});

describe("XA · S6 History", () => {
  it("names whoever made each change and prepares an earlier state for review without going live", async () => {
    const request = detailFetch(url => url === "/api/workspace/systems/website/restore" ? Response.json({ status: "requested", message: "Prepared for review. Your live site is unchanged." }) : undefined);
    const site = harborWebsite("ready");
    const node = await mount(createElement(SystemPage, { ...base, system: site, systems: [site], initialView: "history" }), request);
    expect(node.textContent).toContain("7 releases since Nov 6.");
    expect(node.textContent).toContain("Maya at North Studio");
    expect(node.textContent).not.toContain("Actor not recorded");
    // The live change is marked, its read-back is said, and nothing reads as builder talk.
    expect(node.querySelector('ol[aria-label="History of harbordental.com"] li')?.textContent).toContain("Live");
    expect(node.textContent).toContain("Release 7 is live.");
    expect(node.textContent).toContain("Pebble read the live page back. It matches.");
    expect(node.textContent).not.toMatch(/redeploy|site's code|authorized publisher/);
    const rows = [...node.querySelectorAll<HTMLButtonElement>('ol[aria-label="History of harbordental.com"] button')];
    await act(async () => rows.find(row => row.textContent?.includes("Updated the footer"))!.click());
    await act(async () => button(node, "Go back to this")!.click());
    const call = request.mock.calls.find(([url]) => url === "/api/workspace/systems/website/restore")!;
    expect(JSON.parse(String(call[1]!.body))).toMatchObject({ workspaceId: XA4_WORKSPACE, systemId: XA4_SITE, section: "footer" });
    expect(node.querySelector("[role=status]")?.textContent).toContain("Your live site is unchanged.");
  });

  it("says plainly when nothing is recorded and when History cannot be read", async () => {
    const site = harborWebsite("ready");
    const empty = await mount(createElement(SystemPage, { ...base, system: site, systems: [site], initialView: "history", websiteDetail: { status: "ready", detail: harborWebsiteDetail("empty") } }), detailFetch());
    expect(empty.textContent).toContain("No changes are recorded yet");
    const failed = await mount(createElement(SystemPage, { ...base, system: site, systems: [site], initialView: "history", websiteDetail: { status: "error", message: "History could not be read just now." } }), detailFetch());
    expect(failed.textContent).toContain("Nothing about the site changed.");
    expect(failed.textContent).toContain("History couldn't be read just now");
    expect(failed.textContent?.match(/History could(n't| not) be read just now/g)).toHaveLength(1);
    expect([...failed.querySelectorAll("button")].some(item => item.textContent === "Reload")).toBe(true);
  });
});

describe("XA · S1 Website", () => {
  it("puts the one waiting Possibility on the composer and keeps one primary on the screen", async () => {
    const site = harborWebsite("waiting");
    const node = await mount(createElement(SystemPage, { ...base, system: site, systems: [site] }), detailFetch());
    expect(node.querySelectorAll("[data-xa-primary]")).toHaveLength(1);
    expect(node.textContent).toContain("North Studio looks after this site");
    expect(node.textContent).not.toContain("Agency of record");
    // The composer is the one place to ask; a managed site adds one distinct text link that files a Request.
    expect([...node.querySelectorAll("button")].filter(item => item.textContent === "Ask for a change")).toHaveLength(0);
    expect([...node.querySelectorAll("button")].filter(item => item.textContent === "Send a Request to North Studio")).toHaveLength(1);
    // Only Checks and Reads from stay open beside the site; the rest folds into one disclosure.
    expect(node.querySelector("aside details > summary")?.textContent).toBe("More about this site");
    expect(node.querySelector("[data-st-composer-dock]")?.textContent).toContain("from Maya at North Studio");
    expect(node.querySelector("[data-st-composer-dock]")?.textContent).toContain("Put booking at the top of your home page.");
    await act(async () => [...node.querySelectorAll("[data-st-composer-dock] button")].find(item => item.textContent === "Compare")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(node.textContent).toContain("Your site stays as it is until you say yes.");
  });

  it("keeps Pebble in frame with the plain sentence when a check fails", () => {
    const site = harborWebsite("error");
    const html = renderToStaticMarkup(createElement(SystemPage, { ...base, system: site, systems: [site, harborInbox()], websiteDetail: { status: "ready", detail: harborWebsiteDetail("full") } }));
    expect(html).toContain("pebble-avatar");
    expect(html).toContain("The contact form stopped reaching your inbox at 6:40.");
    expect(html).toContain(`href="/systems/${XA4_INBOX}"`); expect(html).toContain(">See held messages<");
    // The failed check carries a waits dot and its word, in place.
    expect(html).toMatch(/Forms reach your inbox<\/span><span[^>]*data-kind="waits"[^]*?Stopped at 6:40/);
  });
});

describe("XA · S4 a form in Draft", () => {
  it("offers the one yes for its single ready alternative and does not repeat it in the list", async () => {
    const request = vi.fn<typeof fetch>(async input => String(input) === "/api/workspace/systems/make-real" ? Response.json({ live: { live: true, status: "done", headline: "The new-patient form is live", activationId: "a2" } }) : Response.json({ error: "unexpected" }, { status: 500 }));
    const form = { ...harborForm(), kind: "app" as const };
    const node = await mount(createElement(SystemPage, { ...base, system: form, systems: [form] }), request);
    expect(node.textContent).toContain("Nobody outside your business can see it yet.");
    // "Draft" is said once, by the card's dot; no empty Checks row, no unknown actor.
    expect(node.textContent?.match(/Draft/g)).toHaveLength(1);
    expect(node.textContent).not.toContain("Checks");
    expect(node.textContent).not.toContain("Actor not recorded");
    expect([...node.querySelectorAll("button")].filter(item => /Make it live/.test(item.textContent || ""))).toHaveLength(1);
    expect(node.querySelectorAll("[data-xa-primary]")).toHaveLength(1);
    await act(async () => button(node, "Make it live")!.click());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(request).toHaveBeenCalledOnce();
    // One Strelva sentence with See it; no toast and no records that contradict it.
    expect(node.querySelector("[role=status]")?.textContent).toContain("The new-patient form is live.");
    expect([...node.querySelectorAll("a")].find(link => link.textContent === "See it")).toBeDefined();
    expect(node.textContent).not.toContain("No inquiries yet");
  });
});

describe("XA · S2 Bookings and S3 Inquiries", () => {
  it("shows what people see when they book from the recorded hours only, and marks only requests that wait", () => {
    const html = renderToStaticMarkup(createElement(WorkspaceBookings, { workspaceId: XA4_WORKSPACE, view: "week", state: { kind: "ready", bookings: harborBookings("waiting") } }));
    expect(html).toContain("What people see when they book");
    expect(html).toContain("8–12"); expect(html).toContain("Closed");
    expect(html).toContain("1 booking waits for you");
    expect(html).toContain("Dana Reed asked for this time");
    expect(html).toMatch(/aria-label="Dana Reed&#x27;s request waits for you"/);
    // Status only for exceptions: no "Checked in" on past rows, no vendor name, no builder sentence.
    expect(html).not.toContain(">Booked<"); expect(html).not.toContain("Checked in"); expect(html).not.toContain("Claude");
    expect(html).not.toContain("Waiting for the owner"); expect(html).not.toContain("Bookings System");
    expect(html).toContain("No-show");
    expect(html).toContain("8:00–9:00"); expect(html).toContain("10:30–11:00");
    expect(html).toContain(">Change booking hours<"); expect(html).not.toContain("Mon 8:00 AM");
    const ready = renderToStaticMarkup(createElement(WorkspaceBookings, { workspaceId: XA4_WORKSPACE, view: "week", state: { kind: "ready", bookings: harborBookings("ready") } }));
    expect(ready).toContain("Rachel Kim didn&#x27;t come in");
    expect(ready).toContain(">Write to Rachel<");
    const empty = renderToStaticMarkup(createElement(WorkspaceBookings, { workspaceId: XA4_WORKSPACE, view: "week", state: { kind: "ready", bookings: harborBookings("empty") } }));
    expect(empty).toContain("Nothing is booked this week.");
  });

  it("confirms a booking request beside it through the one Needs you decision", async () => {
    const item = ownerDecisionSchema.parse(harborBookingRequestDecision());
    let decided = false;
    const request = vi.fn<typeof fetch>(async (input, init) => String(input).startsWith("/api/workspace/needs-you") && init?.method === "POST"
      ? (decided = true, Response.json({ status: "done" }))
      : Response.json({ role: "owner", items: decided ? [] : [item], complete: true, handled: [], handledAvailable: true }));
    const node = await mount(createElement(BookingRequestYes, { workspaceId: XA4_WORKSPACE, bookingId: item.sourceId, clientName: "Dana Reed", homeHref: "/workspace" }), request);
    expect(node.querySelectorAll("[data-xa-primary]")).toHaveLength(1);
    await act(async () => button(node, "Confirm booking")!.click());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    const call = request.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(JSON.parse(String(call[1]!.body))).toEqual({ workspaceId: XA4_WORKSPACE, itemId: item.id, revision: item.revisionHash, decision: "approve" });
    expect(node.textContent).toContain("Confirmed. Dana Reed is booked.");
  });

  it("counts who waits for a reply in the head and dots only those people", () => {
    const html = renderToStaticMarkup(createElement(WorkspaceInquiries, { workspaceId: XA4_WORKSPACE, state: { kind: "ready", data: harborLeads("ready") } }));
    expect(html).toContain("2 wait for you");
    expect(html.match(/aria-label="Waits for a reply"/g)).toHaveLength(2);
    // Open / Done in the header; the open list leads with the people who wait and folds the rest.
    expect(html).toContain(">Open 2<"); expect(html).toContain(">Done 3<");
    expect(html).toContain(">3 answered<");
    expect(html).toContain("Priya is waiting on your answer.");
    expect(html).toContain(">Send to Priya<"); expect(html).toContain(">Write it myself<");
    expect(html).not.toContain("Subject"); expect(html).not.toContain("Approve and send reply");
    const done = renderToStaticMarkup(createElement(WorkspaceInquiries, { workspaceId: XA4_WORKSPACE, state: { kind: "ready", data: harborLeads("done") } }));
    expect(done).not.toContain("wait for you");
  });
});
