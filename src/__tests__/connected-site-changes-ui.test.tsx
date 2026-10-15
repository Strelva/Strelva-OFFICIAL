// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectedSiteChanges } from "@/experience/connected-sites/ConnectedSiteChanges";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
import type { ConnectedSiteChange, ConnectedSiteChangesView } from "@/products/connected-sites/client";

const WS = "7b000000-0000-4000-8000-000000000001";
const SYSTEM = "7b000000-0000-4000-8000-000000000002";
const SITE = "7b000000-0000-4000-8000-000000000003";
const AGENCY = "7b000000-0000-4000-8000-000000000004";
const CHANGE = "7b000000-0000-4000-8000-000000000005";
const REQUEST = "7b000000-0000-4000-8000-000000000006";
const step = (id: string, kind: string, extra: Record<string, unknown> = {}) => ({
  id: `7b000000-0000-4000-8000-0000000000${id}`, kind, pageUrl: null, editSteps: null, expectText: null, removeText: null, ownerFacing: null, checkResult: null, matched: null, readBack: null,
  releaseNumber: null, note: null, recordedAt: "2026-10-20T12:00:00Z", actor: { kind: "agency", displayName: "North Studio" }, ...extra,
});
const planned = step("a1", "planned", { pageUrl: "https://bakery.example/hours", editSteps: ["Open Pages.", "Make this change: x", "Choose Publish (top right).", "Come back to Strelva and choose Mark done."], expectText: "Open Saturday 9-2", removeText: "Closed Saturdays", ownerFacing: true });
const change = (stage: ConnectedSiteChange["stage"], steps: unknown[] = [planned]) => ({ id: CHANGE, requestId: null, origin: "agency", title: "Update the Saturday hours", createdAt: "2026-10-20T12:00:00Z", stage, steps }) as ConnectedSiteChange;
const view = (who: "owner" | "agency", changes: ConnectedSiteChange[] = [], requests: ConnectedSiteChangesView["requests"] = []): ConnectedSiteChangesView => ({
  viewer: who === "agency" ? { role: "admin", isOwner: false, actingAgencyId: AGENCY, agencyName: "North Studio", businessName: "Bakery" } : { role: "owner", isOwner: true, actingAgencyId: null, agencyName: "North Studio", businessName: "Bakery" },
  site: { id: SITE, siteHost: "bakery.example", siteUrl: "https://bakery.example/", platform: "wix", platformLabel: "Wix", nextReleaseNumber: 3 }, requests, changes,
});
const pendingRequest = (accepted: "pending" | "accepted") => ({ id: REQUEST, request: "Update the Saturday hours", outcome: "Update the Saturday hours to 9-2", page: "/hours", accepted, revision: 2, createdAt: "2026-10-19T12:00:00Z" });

const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("crypto", { randomUUID: () => "11111111-1111-4111-8111-111111111111" }); });
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
async function mount(handler: Handler, props: Partial<Parameters<typeof ConnectedSiteChanges>[0]> = {}) {
  const node = document.createElement("div"); document.body.appendChild(node);
  const root = createRoot(node); roots.push(root);
  const request = vi.fn(async (url: string, init?: RequestInit) => handler(String(url), init));
  await act(async () => root.render(createElement(WorkspaceRequestContext.Provider, { value: request as unknown as typeof fetch }, createElement(ConnectedSiteChanges, { workspaceId: WS, systemId: SYSTEM, ...props }))));
  await act(async () => { await Promise.resolve(); });
  return { node, request };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const button = (node: HTMLElement, label: string) => [...node.querySelectorAll("button")].find(item => item.textContent?.trim() === label) as HTMLButtonElement | undefined;
async function click(element: HTMLElement | undefined) { expect(element).toBeTruthy(); await act(async () => { element!.dispatchEvent(new MouseEvent("click", { bubbles: true })); await Promise.resolve(); }); }
async function type(node: HTMLElement, label: string, value: string) {
  const field = [...node.querySelectorAll("label")].find(item => item.textContent?.trim() === label);
  const control = field ? document.getElementById(field.getAttribute("for") ?? "") as HTMLInputElement | HTMLTextAreaElement | null : null;
  expect(control, label).toBeTruthy();
  await act(async () => {
    const proto = control instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(control, value);
    control!.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const serve = (current: () => ConnectedSiteChangesView, ownerEmail = false, onPost?: (body: Record<string, unknown>, url: string) => Response | Promise<Response> | undefined): Handler => (url, init) => {
  if (init?.method === "POST") {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    return onPost?.(body, url) ?? json({ view: current() });
  }
  return json({ view: current(), ownerEmail });
};

describe("changes on a connected site", () => {
  it("lets the owner ask their agency and shows no plan form", async () => {
    let posted: Record<string, unknown> | null = null;
    const { node } = await mount(serve(() => view("owner"), false, body => { posted = body; return json({ requestId: REQUEST, view: view("owner", [], [pendingRequest("pending")]) }, 201); }));
    expect(node.textContent).toContain("Changes on this site");
    expect(node.textContent).toContain("Strelva never edits bakery.example. North Studio makes changes in Wix’s own editor. Strelva checks the live page afterwards and records a Release.");
    expect(node.querySelector('form[aria-label="Plan a change"]')).toBeNull();
    expect(button(node, "Plan a change")).toBeUndefined();
    await type(node, "What should change?", "Update the Saturday hours to 9–2");
    await click(button(node, "Ask North Studio"));
    expect(posted).toMatchObject({ action: "ask", workspaceId: WS, systemId: SYSTEM, words: "Update the Saturday hours to 9–2", idempotencyKey: "11111111-1111-4111-8111-111111111111" });
    expect(node.textContent).toContain("Asked North Studio. When the planned edit needs your yes, it shows in Needs you.");
    expect(node.textContent).toContain("Asked · waiting for North Studio to plan it");
  });
  it("shows a 409 from asking with the server's words", async () => {
    const { node } = await mount(serve(() => view("owner"), false, () => json({ error: "Requests go to your agency. Bring in an agency first." }, 409)));
    await type(node, "What should change?", "Change the banner");
    await click(button(node, "Ask North Studio"));
    expect(node.textContent).toContain("Requests go to your agency. Bring in an agency first.");
    expect(button(node, "Ask North Studio")!.disabled).toBe(false);
  });
  it("gives an agency with an accepted Request the plan form, owner yes on by default", async () => {
    let posted: Record<string, unknown> | null = null;
    const { node } = await mount(serve(() => view("agency", [], [pendingRequest("accepted")]), false, body => { posted = body; return json({ view: view("agency", [change("planned_waiting")]) }); }));
    expect(node.textContent).toContain("Page: /hours");
    await click(button(node, "Plan this change"));
    expect(node.querySelector('form[aria-label="Plan a change"]')).toBeTruthy();
    expect((node.querySelector<HTMLInputElement>('input[type="url"]'))!.value).toBe("https://bakery.example/hours");
    expect(node.querySelector<HTMLElement>('[role="switch"]')!.getAttribute("aria-checked")).toBe("true");
    await type(node, "After the edit, the page should say", "Open Saturday 9-2");
    await click(button(node, "Save the plan"));
    expect(posted).toMatchObject({ action: "plan", siteId: SITE, requestId: REQUEST, plan: { pageUrl: "https://bakery.example/hours", whatToChange: "Update the Saturday hours", expectText: "Open Saturday 9-2", ownerFacing: true } });
    expect(node.textContent).toContain("Waiting on Bakery to say yes in Needs you.");
  });
  it("asks an agency to accept first", async () => {
    let posted: Record<string, unknown> | null = null;
    const requests: string[] = [];
    const { node, request } = await mount((url, init) => {
      requests.push(url);
      if (init?.method === "POST") { posted = JSON.parse(String(init.body)); return json({ request: {} }); }
      return json({ view: view("agency", [], [pendingRequest("pending")]), ownerEmail: false });
    });
    expect(button(node, "Accept")).toBeTruthy();
    expect(button(node, "Plan this change")).toBeUndefined();
    await click(button(node, "Accept"));
    expect(posted).toEqual({ action: "respond", requestId: REQUEST, expectedRevision: 2, decision: "accepted", idempotencyKey: `kys:${REQUEST}:accepted` });
    expect(requests).toContain("/api/service-requests");
    expect(request).toHaveBeenCalled();
  });
  it("says plainly when the owner was not emailed", async () => {
    const off = await mount(serve(() => view("agency", [change("planned_waiting")]), false));
    expect(off.node.textContent).toContain("Owner email is off, so they weren’t emailed. They see this in Needs you when they sign in.");
    const on = await mount(serve(() => view("agency", [change("planned_waiting")]), true));
    expect(on.node.textContent).toContain("Waiting on Bakery to say yes in Needs you.");
    expect(on.node.textContent).not.toContain("Owner email is off");
  });
  it("sends an owner to Needs you", async () => {
    const { node } = await mount(serve(() => view("owner", [change("planned_waiting")])));
    const link = [...node.querySelectorAll("a")].find(item => item.textContent === "Open Needs you");
    expect(link?.getAttribute("href")).toBe(`/workspace?view=needs-you&workspaceId=${WS}`);
  });
  it("shows the agency the exact edit, copies a task without secrets and marks it done", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    let posted: Record<string, unknown> | null = null;
    const done = change("done", [planned, step("a2", "approved"), step("a3", "marked_done"), step("a4", "checked", { checkResult: "visible" }), step("a5", "released", { readBack: "confirmed", releaseNumber: 3 })]);
    const { node } = await mount(serve(() => view("agency", [change("ready_to_make", [planned, step("a2", "approved")])]), false, body => { posted = body; return json({ view: view("agency", [done]), release: { number: 3 } }); }));
    expect(node.textContent).toContain("Make this edit in Wix");
    expect(node.querySelectorAll('[aria-label="Steps for Wix"] li')).toHaveLength(4);
    expect(node.textContent).toContain("Mark it done once it’s published. Strelva then reads the live page.");
    await click(button(node, "Copy task for your agent"));
    const text = (writeText.mock.calls[0] as unknown[])[0] as string;
    expect(text).toContain("Open Saturday 9-2");
    expect(text).not.toContain("sk_pub_");
    await click(button(node, "Mark done"));
    expect(posted).toMatchObject({ action: "done", changeId: CHANGE });
    expect(node.textContent).toContain("Release 3 recorded. Strelva saw the change on the live page.");
    expect(node.textContent).toContain("Release 3 · Strelva saw it on the live page");
  });
  it("tells the owner who is making the edit, without the agency's buttons", async () => {
    const { node } = await mount(serve(() => view("owner", [change("ready_to_make")])));
    expect(node.textContent).toContain("North Studio is making this edit in Wix.");
    expect(button(node, "Mark done")).toBeUndefined();
  });
  it("offers the agency, and only the agency, a second look or a Release without confirmation", async () => {
    const notSeen = change("not_seen", [planned, step("a3", "marked_done"), step("a4", "checked", { checkResult: "not_visible" })]);
    const agency = await mount(serve(() => view("agency", [notSeen])));
    expect(agency.node.textContent).toContain("Strelva didn’t see “Open Saturday 9-2” on https://bakery.example/hours yet.");
    expect(agency.node.textContent).toContain("Builders can take a minute to publish. If the text is drawn in the browser, Strelva can’t read it.");
    expect(button(agency.node, "Check again")).toBeTruthy();
    await click(button(agency.node, "Record without confirmation"));
    expect(agency.node.textContent).toContain("This records Release 3 saying Strelva didn’t see the change live.");
    const owner = await mount(serve(() => view("owner", [notSeen])));
    expect(button(owner.node, "Check again")).toBeUndefined();
    expect(button(owner.node, "Record without confirmation")).toBeUndefined();
  });
  it("lets the agency recover a change stuck at checking, and no one else", async () => {
    let posted: Record<string, unknown> | null = null;
    const stuck = change("checking", [planned, step("a3", "marked_done")]);
    const agency = await mount(serve(() => view("agency", [stuck]), false, body => { posted = body; return json({ view: view("agency", [stuck]) }); }));
    expect(agency.node.textContent).toContain("Checking the live page");
    expect(button(agency.node, "Withdraw")).toBeTruthy();
    await click(button(agency.node, "Check again"));
    expect(posted).toMatchObject({ action: "check", changeId: CHANGE });
    const owner = await mount(serve(() => view("owner", [stuck])));
    expect(button(owner.node, "Check again")).toBeUndefined();
  });
  it("says the page could not be opened, not that the text is missing", async () => {
    const unreachable = change("not_seen", [planned, step("a3", "marked_done"), step("a4", "checked", { checkResult: "unreachable" })]);
    const { node } = await mount(serve(() => view("agency", [unreachable])));
    expect(node.textContent).toContain("Strelva couldn’t open the page just now.");
  });
  it("shows Release numbers for done and recorded changes, and a declined change", async () => {
    const confirmed = change("done", [planned, step("a5", "released", { readBack: "confirmed", releaseNumber: 3 })]);
    const unconfirmed = { ...change("done_unconfirmed", [planned, step("a6", "released", { readBack: "not_confirmed", releaseNumber: 4 })]), id: "7b000000-0000-4000-8000-0000000000f2" } as ConnectedSiteChange;
    const declined = { ...change("declined", [planned, step("a7", "declined")]), id: "7b000000-0000-4000-8000-0000000000f3" } as ConnectedSiteChange;
    const { node } = await mount(serve(() => view("agency", [confirmed, unconfirmed, declined])));
    expect(node.textContent).toContain("Release 3");
    expect(node.textContent).toContain("Release 4 · recorded without Strelva seeing it live");
    expect(node.textContent).toContain("Bakery said not yet. Nothing changed on the site.");
    expect(button(node, "Plan it again")).toBeTruthy();
  });
  it("asks to reload and disables the buttons when a write cannot be confirmed", async () => {
    const { node } = await mount(serve(() => view("agency", [change("ready_to_make")]), false, () => json({ error: "boom" }, 500)));
    await click(button(node, "Mark done"));
    expect(node.textContent).toContain("We couldn't confirm that change. Reload before trying again.");
    expect(button(node, "Mark done")!.disabled).toBe(true);
    expect(button(node, "Copy task for your agent")!.disabled).toBe(true);
    expect(button(node, "Reload")).toBeTruthy();
  });
  it("renders nothing while keep your site is off for the business", async () => {
    const { node } = await mount(() => json({ error: "Not available." }, 404));
    expect(node.textContent).toBe("");
  });
  it("names the Request it was opened for and scrolls it into view", async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    await mount(serve(() => view("agency", [], [pendingRequest("accepted")])), { focusRequestId: REQUEST });
    expect(scroll).toHaveBeenCalled();
  });
});
