// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UptimeBoard } from "@/app/admin/uptime/UptimeBoard";
import { OperatorPreview } from "@/experience/workspace/preview/OperatorPreview";
import { OPERATOR_TIME, operatorCheckFixture } from "@/experience/workspace/preview/operator-fixture";

let root: Root;
let container: HTMLDivElement;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function click(label: string) { const button = [...container.querySelectorAll("button")].find(button => button.textContent === label); expect(button).toBeDefined(); await act(async () => button!.click()); }

describe("operator site checks", () => {
  it("sorts failing before expiring and healthy sites without inventing certificate or form measurements", () => {
    const request = vi.fn();
    act(() => root.render(createElement(UptimeBoard, { initialResults: operatorCheckFixture(), initialScannedAt: OPERATOR_TIME, request })));
    const rows = [...container.querySelectorAll("tbody tr")];
    expect(rows[0]?.textContent).toContain("northcoastrealty.example");
    expect(rows[1]?.textContent).toContain("harbordental.example");
    expect(container.textContent).toContain("Not measured");
    expect(container.textContent).toContain("Not checked here");
    expect(container.textContent).not.toContain("100%");
    expect(request).not.toHaveBeenCalled();
  });
  it("keeps the previous checks when a new scan is denied", async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ error: "Operator access required" }, { status: 403 }));
    act(() => root.render(createElement(UptimeBoard, { initialResults: operatorCheckFixture(), initialScannedAt: OPERATOR_TIME, request })));
    await click("Run again");
    expect(request).toHaveBeenCalledWith("/api/admin/domain-monitor/scan", { method: "POST" });
    expect(container.textContent).toContain("Previous checks are still shown");
    expect(container.querySelectorAll("tbody tr")).toHaveLength(5);
  });
  it("shows empty without claiming sites are healthy", () => {
    act(() => root.render(createElement(UptimeBoard, { initialResults: [], initialScannedAt: OPERATOR_TIME })));
    expect(container.textContent).toContain("No active client sites");
    expect(container.textContent).not.toContain("all healthy");
  });
});

describe("on-behalf fixture authority", () => {
  it("names who asked and refuses a typed yes without dispatching", async () => {
    const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network allowed"));
    try {
      act(() => root.render(createElement(OperatorPreview, { surface: "ask" })));
      expect(container.textContent).toContain("Asked by Strelva Agency · Runs on Strelva");
      const input = container.querySelector('textarea[aria-label="Ask Strelva"]') as HTMLInputElement;
      await act(async () => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")!.set!.call(input, "yes"); input.dispatchEvent(new Event("input", { bubbles: true })); });
      await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
      expect(container.textContent).toContain("A typed yes approves nothing");
      expect(network).not.toHaveBeenCalled();
    } finally { network.mockRestore(); }
  });
});

describe("release switch changes", () => {
  it("sends the exact reason and revision, preserving the switch and reason on refusal", async () => {
    const { ReleaseFlagsPanel } = await import("@/app/admin/clients/[id]/ReleaseFlagsPanel");
    const { operatorReleaseFixture } = await import("@/experience/workspace/preview/operator-fixture");
    const request = vi.fn().mockResolvedValue(Response.json({ error: "Release revision changed. Refresh before retrying." }, { status: 409 }));
    act(() => root.render(createElement(ReleaseFlagsPanel, { tenantId: "mooney", initialState: operatorReleaseFixture(), request })));
    const toggle = container.querySelector('button[role="switch"][aria-label="Owner sign-in"]') as HTMLButtonElement;
    expect(toggle.disabled).toBe(true);
    expect(request).not.toHaveBeenCalled();
    const reason = container.querySelector('input[id="release-reason-mooney"]') as HTMLInputElement;
    await act(async () => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(reason), "value")!.set!.call(reason, "All owner pages checked"); reason.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(toggle.disabled).toBe(false);
    await act(async () => toggle.click());
    const init = request.mock.calls[0]?.[1];
    expect(JSON.parse(init.body)).toEqual({ kind: "flag", flag: "owner_entry", state: "off", reason: "All owner pages checked", expectedRevision: 1 });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(reason.value).toBe("All owner pages checked");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Release revision changed");
  });
});

describe("monitor evidence qualification", () => {
  it("distinguishes unreadable evidence from a successful empty scan", () => {
    act(() => root.render(createElement(UptimeBoard, { initialResults: [], initialScannedAt: null, initialAvailable: false })));
    expect(container.textContent).toContain("Checks unavailable");
    expect(container.textContent).not.toContain("0 failing");
    expect(container.textContent).not.toContain("No active client sites");
  });
  it("labels old Up evidence as a last check and keeps it after a failed refresh", async () => {
    const request = vi.fn().mockRejectedValue(new Error("Scan unavailable"));
    act(() => root.render(createElement(UptimeBoard, { initialResults: operatorCheckFixture(), initialScannedAt: "2020-01-01T00:00:00Z", request })));
    expect(container.textContent).toContain("Checks are stale");
    expect(container.textContent).toContain("Last check: Up");
    await click("Run again");
    expect(container.textContent).toContain("Checks are stale");
    expect(container.textContent).toContain("Previous checks are still shown");
  });
  it.each([null, "invalid", "2999-01-01T00:00:00Z"])("qualifies an unverified monitor time: %s", initialScannedAt => {
    act(() => root.render(createElement(UptimeBoard, { initialResults: operatorCheckFixture(), initialScannedAt })));
    expect(container.textContent).toContain("Check time is unverified");
    expect(container.textContent).toContain("Last check: Up");
  });
  it("recovers unreadable evidence only after a successful explicit scan", async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ results: operatorCheckFixture(), scannedAt: new Date().toISOString() }));
    act(() => root.render(createElement(UptimeBoard, { initialResults: [], initialScannedAt: null, initialAvailable: false, request })));
    await click("Run again");
    expect(container.textContent).not.toContain("Checks unavailable");
    expect(container.textContent).not.toContain("Last check: Up");
    expect(container.querySelectorAll("tbody tr")).toHaveLength(5);
  });
});

describe("accepted release change with unavailable readback", () => {
  async function mount(request: typeof fetch) {
    const { ReleaseFlagsPanel } = await import("@/app/admin/clients/[id]/ReleaseFlagsPanel");
    const { operatorReleaseFixture } = await import("@/experience/workspace/preview/operator-fixture");
    act(() => root.render(createElement(ReleaseFlagsPanel, { tenantId: "mooney", initialState: operatorReleaseFixture(), request })));
  }
  async function reason(value: string) {
    const input = container.querySelector('input[id="release-reason-mooney"]') as HTMLInputElement;
    await act(async () => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
    return input;
  }
  const toggle = () => container.querySelector('button[role="switch"][aria-label="Owner sign-in"]') as HTMLButtonElement;
  it("retains acceptance, withholds another POST, and refreshes through GET", async () => {
    const { operatorReleaseFixture } = await import("@/experience/workspace/preview/operator-fixture");
    const latest = operatorReleaseFixture();
    if (latest.linked) latest.flags = latest.flags.map(flag => flag.flag === "owner_entry" ? { ...flag, row: "off", effective: "off", revision: flag.revision + 1 } : flag);
    const request = vi.fn().mockResolvedValueOnce(Response.json({ mutation: { status: "accepted" }, readback: { status: "unavailable" }, notice: "The change was accepted. Current flags and history couldn't be read." }))
      .mockResolvedValueOnce(Response.json(latest));
    await mount(request);
    const input = await reason("Release reviewed");
    await act(async () => toggle().click());
    expect(container.textContent).toContain("The change was accepted");
    expect(input.value).toBe("");
    expect(toggle().getAttribute("aria-checked")).toBe("true");
    await reason("Another change");
    expect(toggle().disabled).toBe(true);
    await act(async () => toggle().click());
    expect(request).toHaveBeenCalledTimes(1);
    await click("Refresh flags");
    expect(request.mock.calls[1]).toEqual(["/api/admin/tenants/mooney/release-flags", { cache: "no-store" }]);
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    expect(toggle().disabled).toBe(false);
    expect(container.textContent).toContain("Current flags and history were refreshed");
  });
  it("retains acceptance across failed refresh instead of repeating the mutation", async () => {
    const request = vi.fn().mockResolvedValueOnce(Response.json({ mutation: { status: "accepted" }, readback: { status: "unavailable" }, notice: "The change was accepted." }))
      .mockResolvedValueOnce(Response.json({ error: "Current flags unavailable" }, { status: 503 }));
    await mount(request); await reason("Release reviewed");
    await act(async () => toggle().click());
    await click("Refresh flags");
    expect(container.textContent).toContain("The change was accepted");
    expect(container.textContent).toContain("Current flags unavailable");
    expect(request.mock.calls.filter(([, init]) => init.method === "POST")).toHaveLength(1);
    expect(container.textContent).not.toContain("Nothing was changed");
  });
  it("holds an unknown transport outcome until a current read succeeds", async () => {
    const request = vi.fn().mockRejectedValue(new Error("Connection interrupted"));
    await mount(request); await reason("Release reviewed");
    await act(async () => toggle().click());
    expect(toggle().disabled).toBe(true);
    expect(container.textContent).toContain("Refresh current flags");
    expect(container.textContent).not.toContain("change was accepted");
    expect(container.textContent).not.toContain("Nothing was changed");
  });
});
