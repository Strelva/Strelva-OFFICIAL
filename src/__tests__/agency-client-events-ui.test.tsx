// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgencyClientEvents } from "@/experience/workspace/agency/AgencyClientEvents";

const AGENCY = "28100000-0000-4000-8000-000000000020";
const WS = "28100000-0000-4000-8000-000000000010";
const LETTER = "28100000-0000-4000-8000-0000000000dd";
const ENDPOINT = "28100000-0000-4000-8000-0000000000e1";
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const ahead = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

const letter = (over: Record<string, unknown> = {}) => ({
  id: LETTER, subscriber: "app:bookings:stop_follow_ups", eventId: null, type: "booking.made", sequence: 37, subjectKind: "booking", occurredAt: ago(300),
  attempts: 8, lastError: "timed out", deadAt: ago(240), replayRequestedAt: null, replayedAt: null, replayOutcome: null, ...over,
});
const endpoint = (over: Record<string, unknown> = {}) => ({
  id: ENDPOINT, url: "https://maker.example.test/events", eventTypes: ["booking.made", "inquiry.received"], status: "active", disabledReason: null,
  secretHint: "wxyz", createdByKind: "agency", agencyName: "North Studio", createdAt: ago(5000), ...over,
});
const page = (over: Record<string, unknown> = {}) => ({
  workspaceId: WS, viewer: { kind: "agency", canChange: true }, captureOn: true, stream: { lastSequence: 42, lastEventAt: ago(12) },
  counts: [{ type: "booking.made", count: 6 }, { type: "inquiry.received", count: 9 }], lanes: [], deadLetters: [], endpoints: [], webhooksOn: false, ...over,
});

let root: Root;
let node: HTMLDivElement;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); node = document.createElement("div"); document.body.appendChild(node); root = createRoot(node); });
afterEach(async () => { await act(async () => root.unmount()); node.remove(); vi.unstubAllGlobals(); });
const mount = (request: typeof fetch) => act(async () => root.render(createElement(AgencyClientEvents, { agencyWorkspaceId: AGENCY, workspaceId: WS, clientName: "Harbor Dental", request })));
const button = (text: string) => [...node.querySelectorAll("button")].find((item) => item.textContent?.trim() === text);
const click = (text: string) => act(async () => { button(text)!.click(); });
async function type(label: string, value: string) {
  const input = [...node.querySelectorAll("input")].find((item) => item.labels?.[0]?.textContent?.includes(label))!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const check = (label: string) => act(async () => { [...node.querySelectorAll("label")].find((item) => item.textContent?.includes(label))!.querySelector("input")!.click(); });
const RETIRED = ["Strelva handled", "Internal applications", "Private app", "Delegated work", "Provider handoff", "Provider change", "Make it real", "Ready-made", "capability", "integration"];

describe("agency client events", () => {
  it("renders nothing while events are off", async () => {
    await mount(vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: "off" }, { status: 503 })));
    expect(node.innerHTML).toBe("");
  });

  it("asks for the client in the address", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json(page()));
    await mount(request);
    expect(request.mock.calls[0]![0]).toBe(`/api/workspace/app-events?workspaceId=${WS}&agencyWorkspaceId=${AGENCY}`);
  });

  it("says events are not being recorded when capture is off", async () => {
    await mount(vi.fn<typeof fetch>().mockResolvedValue(Response.json(page({ captureOn: false, counts: [], stream: { lastSequence: 0, lastEventAt: null } }))));
    expect(node.textContent).toContain("Events aren't being recorded for any business yet.");
    expect(node.textContent).not.toContain("this week");
  });

  it("says every event was delivered when nothing failed", async () => {
    await mount(vi.fn<typeof fetch>().mockResolvedValue(Response.json(page())));
    expect(node.textContent).toContain("Events Apps receive");
    expect(node.textContent).toContain("Last event 12 minutes ago · 15 this week");
    expect(node.textContent).toContain("Every event was delivered.");
  });

  it("lists lanes waiting to retry and events not delivered, naming the App", async () => {
    const lanes = [{ subscriber: "app:bookings:stop_follow_ups", deliveredThrough: 40, behind: 2, attempts: 2, nextAttemptAt: ahead(14), lastError: "timed out" }];
    await mount(vi.fn<typeof fetch>().mockResolvedValue(Response.json(page({ lanes, deadLetters: [letter()] }))));
    const text = node.textContent!;
    expect(text).toContain("Waiting to retry");
    expect(text).toMatch(/Bookings · 2 tries · next in 1[34] minutes · timed out/);
    expect(text).toContain("Not delivered");
    expect(text).toMatch(/Booking made #37 · Bookings · 4 hours ago/);
    expect(text).not.toContain("Every event was delivered.");
  });

  it("names a webhook by its address", async () => {
    const dead = letter({ subscriber: `webhook:${ENDPOINT}` });
    await mount(vi.fn<typeof fetch>().mockResolvedValue(Response.json(page({ deadLetters: [dead], endpoints: [endpoint()], webhooksOn: true }))));
    expect(node.textContent).toContain("Booking made #37 · maker.example.test");
  });

  it("posts the exact retry body and says it is queued", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(page({ deadLetters: [letter()] })))
      .mockResolvedValueOnce(Response.json({ view: {} }))
      .mockResolvedValueOnce(Response.json(page({ deadLetters: [letter({ replayRequestedAt: ago(0) })] })));
    await mount(request);
    await click("Try again");
    const [url, init] = request.mock.calls[1]!;
    expect(url).toBe("/api/workspace/app-events");
    expect(init!.method).toBe("POST");
    expect(JSON.parse(String(init!.body))).toEqual({ action: "retry", deadLetterId: LETTER, workspaceId: WS, agencyWorkspaceId: AGENCY });
    expect(node.textContent).toContain("Queued. It runs within 5 minutes.");
    expect(button("Try again")).toBeUndefined();
  });

  it("shows the refusal when a retry is refused", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(page({ deadLetters: [letter()] }))).mockResolvedValueOnce(Response.json({ error: "This event was already delivered." }, { status: 409 }));
    await mount(request);
    await click("Try again");
    expect(node.textContent).toContain("This event was already delivered.");
  });

  it("hides every button for a member who cannot change", async () => {
    await mount(vi.fn<typeof fetch>().mockResolvedValue(Response.json(page({ viewer: { kind: "agency", canChange: false }, deadLetters: [letter()], endpoints: [endpoint()], webhooksOn: true }))));
    expect(node.querySelectorAll("button")).toHaveLength(0);
    expect(node.textContent).toContain("Booking made #37");
    expect(node.textContent).toContain("maker.example.test");
    expect(node.textContent).not.toContain("Add a webhook");
  });

  it("hides the Webhooks section while Webhooks are off and none exist", async () => {
    await mount(vi.fn<typeof fetch>().mockResolvedValue(Response.json(page())));
    expect(node.textContent).not.toContain("Webhooks");
    expect(node.textContent).not.toContain("Add a webhook");
  });

  it("with Webhooks off, still lets a person pause or turn off an existing address", async () => {
    await mount(vi.fn<typeof fetch>().mockResolvedValue(Response.json(page({ endpoints: [endpoint()], webhooksOn: false }))));
    expect(node.textContent).toContain("Webhooks");
    expect(button("Pause")).toBeDefined();
    expect(button("Turn off")).toBeDefined();
    expect(button("New secret")).toBeUndefined();
    expect(node.textContent).not.toContain("Add a webhook");
  });

  it("lists addresses with the events, status and the end of the secret", async () => {
    await mount(vi.fn<typeof fetch>().mockResolvedValue(Response.json(page({ endpoints: [endpoint(), endpoint({ id: "28100000-0000-4000-8000-0000000000e2", status: "paused", secretHint: "abcd" })], webhooksOn: true }))));
    const text = node.textContent!;
    expect(text).toContain("maker.example.test · Booking made, Inquiry received");
    expect(text).toContain("Receiving events · Secret ends in wxyz");
    expect(text).toContain("Paused · Secret ends in abcd");
    expect(text).not.toContain("https://maker");
  });

  it("adds a webhook, shows the secret once, and a fresh read never has it", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(page({ webhooksOn: true })))
      .mockResolvedValueOnce(Response.json({ view: endpoint(), secret: "whsec_shown_once_value" }))
      .mockResolvedValueOnce(Response.json(page({ webhooksOn: true, endpoints: [endpoint()] })))
      .mockResolvedValueOnce(Response.json(page({ webhooksOn: true, endpoints: [endpoint()] })));
    await mount(request);
    expect(button("Add webhook")!.disabled).toBe(true);
    await type("Address", "http://maker.example.test/events");
    await check("Booking made");
    expect(button("Add webhook")!.disabled).toBe(true);
    await type("Address", "https://maker.example.test/events");
    expect(button("Add webhook")!.disabled).toBe(false);
    await act(async () => { node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(JSON.parse(String(request.mock.calls[1]![1]!.body))).toEqual({
      action: "create_webhook", url: "https://maker.example.test/events", eventTypes: ["booking.made"], workspaceId: WS, agencyWorkspaceId: AGENCY,
    });
    expect(node.textContent).toContain("whsec_shown_once_value");
    expect(node.textContent).toContain("Copy this now. It won't be shown again.");
    expect(node.textContent).toContain("Secret ends in wxyz");
    await click("I've copied it");
    expect(node.textContent).not.toContain("whsec_shown_once_value");
    // A new mount reads the endpoint again and the secret is not in the answer.
    await act(async () => root.unmount());
    root = createRoot(node);
    await mount(request);
    expect(node.textContent).not.toContain("whsec_");
  });

  it("shows the refusal when the agency's access does not cover the events", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(page({ webhooksOn: true })))
      .mockResolvedValueOnce(Response.json({ error: "Your agency's access to this client doesn't cover those events." }, { status: 403 }));
    await mount(request);
    await type("Address", "https://maker.example.test/events");
    await check("Booking made");
    await act(async () => { node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(node.textContent).toContain("Your agency's access to this client doesn't cover those events.");
    expect(node.textContent).not.toContain("whsec_");
  });

  it("asks before turning a webhook off, and then sends it", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(page({ webhooksOn: true, endpoints: [endpoint()] })))
      .mockResolvedValueOnce(Response.json({ view: endpoint({ status: "disabled", disabledReason: "by_person" }) }))
      .mockResolvedValueOnce(Response.json(page({ webhooksOn: true, endpoints: [endpoint({ status: "disabled", disabledReason: "by_person" })] })));
    await mount(request);
    await click("Turn off");
    expect(request).toHaveBeenCalledTimes(1);
    expect(node.textContent).toContain("Turned off webhooks can't be turned back on.");
    await click("Keep it");
    expect(node.textContent).not.toContain("Turned off webhooks can't be turned back on.");
    await click("Turn off");
    await click("Turn off");
    expect(JSON.parse(String(request.mock.calls[1]![1]!.body))).toEqual({ action: "set_webhook", endpointId: ENDPOINT, status: "disabled", workspaceId: WS, agencyWorkspaceId: AGENCY });
    expect(node.textContent).toContain("Turned off · Secret ends in wxyz");
    expect(button("Pause")).toBeUndefined();
  });

  it("pauses, resumes and renews a secret", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(page({ webhooksOn: true, endpoints: [endpoint()] })))
      .mockResolvedValueOnce(Response.json({ view: endpoint({ status: "paused" }) }))
      .mockResolvedValueOnce(Response.json(page({ webhooksOn: true, endpoints: [endpoint({ status: "paused" })] })))
      .mockResolvedValueOnce(Response.json({ view: endpoint(), secret: "whsec_new_value" }))
      .mockResolvedValueOnce(Response.json(page({ webhooksOn: true, endpoints: [endpoint({ status: "paused", secretHint: "alue" })] })));
    await mount(request);
    await click("Pause");
    expect(JSON.parse(String(request.mock.calls[1]![1]!.body))).toMatchObject({ action: "set_webhook", status: "paused" });
    expect(button("Resume")).toBeDefined();
    await click("New secret");
    expect(JSON.parse(String(request.mock.calls[3]![1]!.body))).toMatchObject({ action: "rotate_webhook_secret", endpointId: ENDPOINT });
    expect(node.textContent).toContain("whsec_new_value");
  });

  it("shows a retry when the read fails", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({}, { status: 500 })).mockResolvedValueOnce(Response.json(page()));
    await mount(request);
    expect(node.textContent).toContain("Events for Harbor Dental could not be read. Nothing changed.");
    await click("Retry");
    expect(node.textContent).toContain("Last event");
  });

  it("refuses a view for another business", async () => {
    await mount(vi.fn<typeof fetch>().mockResolvedValue(Response.json(page({ workspaceId: "28100000-0000-4000-8000-000000000099" }))));
    expect(node.textContent).toContain("could not be read");
  });

  it("uses no retired word and never says AI", async () => {
    const lanes = [{ subscriber: "app:bookings:stop_follow_ups", deliveredThrough: 40, behind: 2, attempts: 2, nextAttemptAt: ahead(14), lastError: "timed out" }];
    await mount(vi.fn<typeof fetch>().mockResolvedValue(Response.json(page({ lanes, deadLetters: [letter()], endpoints: [endpoint()], webhooksOn: true }))));
    const text = node.textContent!;
    for (const word of RETIRED) expect(text.toLowerCase(), word).not.toContain(word.toLowerCase());
    expect(text).not.toMatch(/\bAI\b/);
  });
});
