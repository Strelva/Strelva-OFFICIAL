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
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Previous checks are still shown");
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
      expect(container.textContent).toContain("Asked by Strelva operations, for Sheri");
      const input = container.querySelector('input[aria-label="Ask Strelva"]') as HTMLInputElement;
      await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "yes"); input.dispatchEvent(new Event("input", { bubbles: true })); });
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
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(reason, "All owner pages checked"); reason.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(toggle.disabled).toBe(false);
    await act(async () => toggle.click());
    const init = request.mock.calls[0]?.[1];
    expect(JSON.parse(init.body)).toEqual({ kind: "flag", flag: "owner_entry", state: "off", reason: "All owner pages checked", expectedRevision: 1 });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(reason.value).toBe("All owner pages checked");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Release revision changed");
  });
});
