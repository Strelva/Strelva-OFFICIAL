// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OperatorEventDeliveries } from "@/app/admin/clients/[id]/OperatorEventDeliveries";

const WS = "28100000-0000-4000-8000-000000000010";
const LETTER = "28100000-0000-4000-8000-0000000000dd";
const ENDPOINT = "28100000-0000-4000-8000-0000000000e1";
const view = (over: Record<string, unknown> = {}) => ({
  workspaceId: WS, viewer: { kind: "operator", canChange: true }, captureOn: true, stream: { lastSequence: 42, lastEventAt: "2026-10-15T12:00:00Z" },
  counts: [{ type: "booking.made", count: 6 }],
  lanes: [{ subscriber: "app:bookings:stop_follow_ups", deliveredThrough: 40, behind: 2, attempts: 1, nextAttemptAt: "2026-10-15T12:30:00Z", lastError: "timed out" }],
  deadLetters: [{ id: LETTER, subscriber: `webhook:${ENDPOINT}`, eventId: null, type: "booking.made", sequence: 37, subjectKind: "booking", occurredAt: "2026-10-15T08:00:00Z", attempts: 8, lastError: "refused", deadAt: "2026-10-15T09:00:00Z", replayRequestedAt: null, replayedAt: null, replayOutcome: null }],
  endpoints: [{ id: ENDPOINT, url: "https://maker.example.test/e", eventTypes: ["booking.made"], status: "active", disabledReason: null, secretHint: "wxyz", createdByKind: "agency", agencyName: "North Studio", createdAt: "2026-10-01T00:00:00Z" }],
  ...over,
});

let root: Root;
let node: HTMLDivElement;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); node = document.createElement("div"); document.body.appendChild(node); root = createRoot(node); });
afterEach(async () => { await act(async () => root.unmount()); node.remove(); vi.unstubAllGlobals(); });
const mount = (request: typeof fetch) => act(async () => root.render(createElement(OperatorEventDeliveries, { tenantId: "harbor", request })));

describe("operator event deliveries", () => {
  it("renders nothing while events are off", async () => {
    await mount(vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: "off" }, { status: 503 })));
    expect(node.innerHTML).toBe("");
  });

  it("says an unlinked client has no events", async () => {
    await mount(vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: "x" }, { status: 404 })));
    expect(node.textContent).toBe("This client has no linked business, so events don't apply.");
  });

  it("lists lanes, what was not delivered and the addresses, read-only except Try again", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json(view()));
    await mount(request);
    expect(request.mock.calls[0]![0]).toBe("/api/admin/tenants/harbor/app-events");
    const text = node.textContent!;
    expect(text).toContain("42 recorded · 6 this week");
    expect(text).toContain("Bookings · through #40 · 2 behind · 1 try, next");
    expect(text).toContain("Booking made #37 · maker.example.test");
    expect(text).toContain("Secret ends in wxyz · added by North Studio");
    expect([...node.querySelectorAll("button")].map((item) => item.textContent)).toEqual(["Try again"]);
  });

  it("posts the retry and says it is queued", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(view()))
      .mockResolvedValueOnce(Response.json(view()))
      .mockResolvedValueOnce(Response.json(view()));
    await mount(request);
    await act(async () => { [...node.querySelectorAll("button")].find((item) => item.textContent === "Try again")!.click(); });
    const [url, init] = request.mock.calls[1]!;
    expect(url).toBe("/api/admin/tenants/harbor/app-events");
    expect(JSON.parse(String(init!.body))).toEqual({ action: "retry", deadLetterId: LETTER });
    expect(node.textContent).toContain("Queued. It runs within 5 minutes.");
  });

  it("says when capture is off and when everything was delivered", async () => {
    await mount(vi.fn<typeof fetch>().mockResolvedValue(Response.json(view({ captureOn: false, deadLetters: [], lanes: [], endpoints: [] }))));
    expect(node.textContent).toContain("Events aren't being recorded for any business yet.");
    expect(node.textContent).toContain("Every event was delivered.");
  });

  it("shows an error it cannot read", async () => {
    await mount(vi.fn<typeof fetch>().mockResolvedValue(Response.json({ nope: true })));
    expect(node.textContent).toContain("Events could not be read. Nothing changed.");
  });
});
