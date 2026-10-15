// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ListingsSyncPanel } from "@/experience/listings-sync/ListingsSyncPanel";
import { ListingsSyncSummary } from "@/experience/listings-sync/ListingsSyncSummary";
import { FACT_STATE_LABEL, FACT_STATES, type ListingsSyncView } from "@/products/listings-sync";
import { agencyWaiting, matches, noAgency, twoDiffer, waitingOnGoogle } from "@/app/preview/strelva/listings-sync/fixture";

const WS = "29100000-0000-4000-8000-000000000010";
let root: Root;
let node: HTMLDivElement;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); node = document.createElement("div"); document.body.appendChild(node); root = createRoot(node); });
afterEach(async () => { await act(async () => root.unmount()); node.remove(); vi.unstubAllGlobals(); });

const panel = (props: Partial<Parameters<typeof ListingsSyncPanel>[0]> = {}) => act(async () => root.render(createElement(ListingsSyncPanel, {
  workspaceId: WS, viewerIsOwner: true, businessName: "Harbor Dental", request: vi.fn<typeof fetch>().mockResolvedValue(Response.json({}, { status: 404 })), ...props,
})));
const button = (text: string) => [...node.querySelectorAll("button")].find(item => item.textContent?.includes(text));

describe("ListingsSyncPanel", () => {
  it("renders nothing when the route answers 404", async () => {
    await panel({});
    expect(node.innerHTML).toBe("");
  });

  it("renders nothing when told the App is off", async () => {
    await panel({ initial: null });
    expect(node.innerHTML).toBe("");
  });

  it("fetches the view and shows its headline", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json(matches));
    await panel({ request });
    expect(request.mock.calls[0]![0]).toBe(`/api/workspace/listings-sync?workspaceId=${WS}`);
    expect(node.textContent).toContain("Everything matches");
    expect(node.textContent).toContain("Release 3");
  });

  it("shows each fixture's headline", async () => {
    const cases: Array<[ListingsSyncView, string]> = [[matches, "Everything matches"], [twoDiffer, "2 places differ"], [waitingOnGoogle, "Waiting on Google"], [noAgency, "1 place differs"]];
    for (const [initial, text] of cases) {
      await panel({ initial, key: text } as never);
      expect(node.textContent, text).toContain(text);
    }
  });

  it("shows every fact state label", async () => {
    const view: ListingsSyncView = { ...matches, surfaces: [{ ...matches.surfaces[0]!, facts: FACT_STATES.map((state, index) => ({ fact: (["phone", "address", "hours", "special_hours", "services", "booking_link"] as const)[index]!, state, shown: state === "differs" ? "x" : null, expected: "y" })) }] };
    await panel({ initial: view });
    for (const state of FACT_STATES) expect(node.textContent).toContain(FACT_STATE_LABEL[state]);
  });

  it("does not say Matches for a read place where nothing matches", async () => {
    const view: ListingsSyncView = { ...matches, surfaces: [{ ...matches.surfaces[0]!, state: "read", facts: [{ fact: "phone", state: "not_shown", shown: null, expected: "y" }, { fact: "hours", state: "not_checked", shown: null, expected: "y" }] }] };
    await panel({ initial: view });
    expect(node.textContent).toContain(FACT_STATE_LABEL.not_checked);
    expect(node.textContent).not.toContain("Matches");
  });

  it("gives the owner a link to Needs you but no approve control", async () => {
    await panel({ initial: twoDiffer });
    expect(node.textContent).toContain("Review and hold to make it live in Needs you.");
    const link = [...node.querySelectorAll("a")].find(a => a.textContent?.includes("Open Needs you"))!;
    expect(link.getAttribute("href")).toBe(`/workspace?workspaceId=${WS}`);
    expect([...node.querySelectorAll("button")].map(b => b.textContent)).toEqual(["Check now"]);
  });

  it("tells an agency it is waiting on the business, with no approve link", async () => {
    await panel({ initial: agencyWaiting, viewerIsOwner: false, businessName: "North Studio" });
    expect(node.textContent).toContain("Waiting on North Studio");
    expect(node.textContent).toContain("Owner email is off; the owner sees this in Strelva.");
    expect(node.textContent).toContain("1 changed detail is waiting for the owner to confirm.");
    expect([...node.querySelectorAll("a")].some(a => a.textContent?.includes("Needs you"))).toBe(false);
  });

  it("copies the exact line to change by hand", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await panel({ initial: noAgency });
    expect(node.textContent).toContain("Change these yourself");
    await act(async () => { button("Copy")!.click(); });
    expect(writeText).toHaveBeenCalledWith("Phone: change “(716) 555-9999” to “(716) 555-0100”");
    expect(node.querySelector("[role=status]")!.textContent).toBe("Copied");
  });

  it("says when copying fails", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(async () => { throw new Error("denied"); }) } });
    await panel({ initial: noAgency });
    await act(async () => { button("Copy")!.click(); });
    expect(node.querySelector("[role=status]")!.textContent).toBe("Copy failed");
  });

  it("posts a check and shows Checking… while it runs", async () => {
    let finish!: (response: Response) => void;
    const request = vi.fn<typeof fetch>().mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; }));
    await panel({ initial: matches, request });
    await act(async () => { button("Check now")!.click(); });
    expect(request).toHaveBeenCalledWith("/api/workspace/listings-sync", expect.objectContaining({ method: "POST", body: JSON.stringify({ action: "check", workspaceId: WS }) }));
    expect(node.querySelector("[role=status]")!.textContent).toBe("Checking…");
    await act(async () => { finish(Response.json({ ...twoDiffer })); });
    expect(node.textContent).toContain("2 places differ");
    expect(button("Check now")).toBeTruthy();
  });

  it("names a place Strelva could not read and a Google listing to reconnect", async () => {
    const view: ListingsSyncView = { ...matches, surfaces: [
      { ...matches.surfaces[0]!, state: "unreadable", reason: "Couldn't read this page. Strelva will check again.", facts: [] },
      { ...matches.surfaces[1]!, state: "reconnect", reason: "Reconnect Google to compare this listing.", facts: [] },
    ] };
    await panel({ initial: view });
    expect(node.textContent).toContain("Couldn't read this page. Strelva will check again.");
    expect(node.textContent).toContain("Reconnect Google to compare this listing.");
    expect(node.querySelector(`a[href="/workspace/connections?workspaceId=${WS}"]`)).toBeTruthy();
  });
});

describe("ListingsSyncSummary", () => {
  const mount = (request: typeof fetch) => act(async () => root.render(createElement(ListingsSyncSummary, { workspaceId: WS, clientName: "North Studio", request })));
  it("renders nothing while off", async () => {
    await mount(vi.fn<typeof fetch>().mockResolvedValue(Response.json({}, { status: 404 })));
    expect(node.innerHTML).toBe("");
  });
  it("shows one line and an Open link, with no approve control", async () => {
    await mount(vi.fn<typeof fetch>().mockResolvedValue(Response.json(agencyWaiting)));
    expect(node.textContent).toContain("Waiting on North Studio");
    expect(node.querySelector("a")!.getAttribute("href")).toBe(`/workspace/business-details?workspaceId=${WS}#listings`);
    expect(node.querySelector("button")).toBeNull();
  });
  it("shows the headline when nothing waits on the owner", async () => {
    await mount(vi.fn<typeof fetch>().mockResolvedValue(Response.json(matches)));
    expect(node.textContent).toContain("Listings in sync · Everything matches");
  });
});
