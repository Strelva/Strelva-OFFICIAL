// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BusinessSetupPanel } from "@/experience/workspace/BusinessSetupPanel";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
import { requestDraftKey, readRequestDraft } from "@/experience/workspace/request-draft";
import { sourcePageName, websiteHost } from "@/experience/getting-started/GettingStarted";
import { FirstDay } from "@/experience/getting-started/FirstDay";
import { SignUpDoor } from "@/experience/getting-started/SignUpDoor";
import { XaChecklist, XaEntrySteps } from "@/components/ui/strelva/Xa";
import type { FoundFact } from "@/products/getting-started/contracts";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => createElement("a", { href, ...rest }, children) }));
vi.mock("@/platform/infra/db/browser-client", () => ({ createBrowserSupabase: () => null }));

const actorId = "c1a10000-0000-4000-8000-000000000001";
const workspaceId = "c1a10000-0000-4000-8000-000000000002";
const actorEmail = "dr.lin@harbordental.com";
let root: Root;
let node: HTMLDivElement;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); sessionStorage.clear(); node = document.createElement("div"); document.body.append(node); root = createRoot(node); });
afterEach(async () => { await act(async () => root.unmount()); node.remove(); vi.unstubAllGlobals(); });
const render = async (element: ReturnType<typeof createElement>) => { await act(async () => root.render(element)); };

describe("XA-1 owner door: what Strelva keeps", () => {
  it("turns the picks and the owner's own words into one first ask, carried to Home", async () => {
    const navigate = vi.fn();
    const transport = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => init?.method !== "POST"
      ? Response.json({ actorId, actorEmail, businesses: [] })
      : Response.json({ workspaceId, requestId: null, askConversationId: "c1a10000-0000-4000-8000-000000000003", agencyRequired: true, alreadyCreated: false }));
    await render(createElement(WorkspaceRequestContext.Provider, { value: transport as typeof fetch }, createElement(BusinessSetupPanel, { gettingStarted: true, initialName: "Harbor Dental", navigate })));
    expect(node.querySelector('[aria-current="step"]')?.textContent).toContain("Your business");
    // Own words appear only once the owner asks for them.
    expect(node.querySelector("textarea")).toBeNull();
    const box = (label: string) => [...node.querySelectorAll<HTMLLabelElement>("label")].find(item => item.textContent?.includes(label))!.querySelector("input")!;
    await act(async () => box("Take bookings").click());
    await act(async () => box("Something else").click());
    const words = node.querySelector<HTMLTextAreaElement>("textarea")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(words, "Remind patients the day before");
      words.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect([...node.querySelectorAll("button")].find(item => item.getAttribute("data-xa-primary"))?.textContent).toBe("Create Harbor Dental");
    expect(node.querySelectorAll("[data-xa-primary]")).toHaveLength(1);
    await act(async () => node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    const posted = JSON.parse(String(transport.mock.calls.find(call => call[1]?.method === "POST")![1]!.body));
    expect(posted).toMatchObject({ destination: { kind: "new", name: "Harbor Dental" }, initialRequest: "Take bookings. Remind patients the day before" });
    expect(navigate).toHaveBeenCalledWith(`/workspace/getting-started?workspaceId=${workspaceId}`);
    expect(readRequestDraft(sessionStorage, requestDraftKey({ actorEmail, workspaceId }))).toBe("Take bookings. Remind patients the day before");
  });

  it("creates the business with no ask when nothing is picked", async () => {
    const navigate = vi.fn();
    const transport = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => init?.method !== "POST"
      ? Response.json({ actorId, actorEmail, businesses: [] })
      : Response.json({ workspaceId, requestId: null, alreadyCreated: false }));
    await render(createElement(WorkspaceRequestContext.Provider, { value: transport as typeof fetch }, createElement(BusinessSetupPanel, { gettingStarted: true, initialName: "Harbor Dental", navigate })));
    await act(async () => node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(JSON.parse(String(transport.mock.calls.find(call => call[1]?.method === "POST")![1]!.body)).initialRequest).toBeNull();
    expect(navigate).toHaveBeenCalledWith(`/workspace/getting-started?workspaceId=${workspaceId}`);
  });

  it("says what failed with Pebble and offers to check again", async () => {
    const transport = vi.fn(async () => Response.json({ error: "Business access could not be confirmed." }, { status: 503 }));
    await render(createElement(WorkspaceRequestContext.Provider, { value: transport as typeof fetch }, createElement(BusinessSetupPanel, { gettingStarted: true })));
    expect(node.querySelector("h1")?.textContent).toBe("Your businesses didn't load.");
    expect(node.querySelector('[role="alert"]')?.textContent).toContain("could not be confirmed");
    expect([...node.querySelectorAll("button")].some(item => item.textContent === "Check again")).toBe(true);
  });
});

describe("XA-1 words owners see", () => {
  it("names pages instead of showing paths, and addresses without a scheme", () => {
    expect(sourcePageName("https://harbordental.com/contact")).toBe("Contact page");
    expect(sourcePageName("https://harbordental.com/new-patients/")).toBe("New patients page");
    expect(sourcePageName("https://harbordental.com/")).toBe("Home page");
    expect(websiteHost("https://www.harbordental.com/")).toBe("harbordental.com");
    expect(websiteHost("harbordental.com")).toBe("harbordental.com");
  });

  it("puts the agency's name on an invitation door, never Strelva in its place", () => {
    const html = renderToStaticMarkup(createElement(SignUpDoor, { next: `/workspace/claim/${"a".repeat(43)}`, asAgency: false, doors: false, requestedNext: null, identityName: "Harbor Dental", brand: "North Studio", emailReady: true }));
    expect(html).toContain("North Studio");
    expect(html).toContain("Create access for Harbor Dental.");
    expect(html).toContain("Runs on Strelva.");
    expect(html).not.toContain('aria-label="Strelva home"');
  });
});

describe("XA-1 kit additions", () => {
  it("ticks found facts in place and names the current step", async () => {
    const onChange = vi.fn();
    await render(createElement("div", null,
      createElement(XaEntrySteps, { steps: ["Your business", "Your site", "Check it"], current: 2 }),
      createElement(XaChecklist<string>, { label: "Found", listLabel: "Found facts", checked: new Set(["a"]), onChange, items: [{ value: "a", kicker: "Phone", label: "(716) 555-0142" }, { value: "b", kicker: "Hours", label: "Mon to Fri 8 to 5" }] })));
    expect(node.querySelector('[aria-current="step"]')?.textContent).toContain("Check it");
    expect(node.textContent).toContain("Your business, done");
    const boxes = node.querySelectorAll<HTMLInputElement>('ul[aria-label="Found facts"] input');
    expect([...boxes].map(box => box.checked)).toEqual([true, false]);
    await act(async () => boxes[1]!.click());
    expect(onChange).toHaveBeenCalledWith("b", true);
  });
});

describe("XA-1 day one", () => {
  const fact: FoundFact = { entity: "fact", key: "description", id: "c1a10000-0000-4000-8000-0000000000f1", status: "later", sourceKind: "website_crawl", sourceRef: "https://harbordental.com/", foundBy: "owner", foundAt: "2026-10-15T12:00:00.000Z", confirmable: true, label: "Description", display: "Gentle family dentistry on Elmwood.", value: "Gentle family dentistry on Elmwood.", sourceUrl: "https://harbordental.com/", quote: null, current: null };
  it("greets the owner and docks the one waiting detail on the composer", async () => {
    await render(createElement(FirstDay, { ownerName: "Dr. Lin", businessName: "Harbor Dental", waiting: [fact], checkHref: "/workspace/getting-started?workspaceId=x", onAsk: vi.fn(), now: new Date(2026, 9, 15, 8, 4), events: [{ id: "1", label: "You added 4 details from harbordental.com", state: "done" }] }));
    expect(node.querySelector("h1")?.textContent).toBe("Good morning, Dr. Lin.");
    expect(node.textContent).toContain("Harbor Dental is set up. One detail waits for you.");
    expect(node.textContent).toContain("Check your description:");
    expect(node.querySelector('a[href="/workspace/getting-started?workspaceId=x"]')?.textContent).toBe("Check it");
    expect(node.textContent).toContain("You added 4 details from harbordental.com");
  });
  it("says nothing needs the owner when nothing waits", async () => {
    await render(createElement(FirstDay, { ownerName: null, businessName: "Harbor Dental", waiting: [], checkHref: "#", events: [], now: new Date(2026, 9, 15, 19, 0) }));
    expect(node.querySelector("h1")?.textContent).toBe("Good evening.");
    expect(node.textContent).toContain("Nothing needs you yet.");
  });
});
