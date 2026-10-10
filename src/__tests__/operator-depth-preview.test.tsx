// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OperatorDepthPreview } from "@/experience/workspace/preview/OperatorDepthPreview";
import { createOperatorDepthTransport, OPERATOR_DEPTH_SURFACES, operatorDepthPayLinks, type OperatorDepthScenario } from "@/experience/workspace/preview/operator-depth-fixture";

const calls = vi.hoisted(() => ({ fetch: vi.fn(), server: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: calls.refresh }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/app/admin/actions/actions", () => ({ resolvePortfolioActions: calls.server, escalatePortfolioActions: calls.server, draftPortfolioOpportunity: calls.server }));
vi.mock("@/app/admin/needs-you/actions", () => ({ setStrelvaPolicyAction: calls.server }));
vi.mock("@/app/admin/work/effort-actions", () => ({ recordBusinessEffortAction: calls.server, voidBusinessEffortAction: calls.server }));
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", calls.fetch);
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe("isolated operator depth specimens", () => {
  it.each(OPERATOR_DEPTH_SURFACES)("renders %s ready and empty without live reads or server actions", async surface => {
    for (const scenario of ["ready", "empty"] as const) {
      await act(async () => root.render(createElement(OperatorDepthPreview, { key: scenario, surface, scenario })));
      expect(container.querySelector("h1")).not.toBeNull();
      expect(calls.fetch).not.toHaveBeenCalled();
      expect(calls.server).not.toHaveBeenCalled();
      expect(container.textContent).not.toMatch(/\b(AI|agent|automation|workflow|task)\b/i);
    }
  });
  it.each(["loading", "error", "denied"] as const)("renders every %s state without exposing live controls", async (scenario: OperatorDepthScenario) => {
    for (const surface of OPERATOR_DEPTH_SURFACES) {
      await act(async () => root.render(createElement(OperatorDepthPreview, { key: surface, surface, scenario })));
      expect(container.querySelector("h1")).not.toBeNull();
      expect(container.querySelector("form")).toBeNull();
      expect(calls.fetch).not.toHaveBeenCalled();
      expect(calls.server).not.toHaveBeenCalled();
      if (scenario === "denied") expect(container.textContent).toContain("Operators only");
      if (scenario === "error") expect(container.querySelector('[role="alert"]')?.textContent).toContain("No changes were made");
    }
  });
  it("rehearses approval locally without the actual server action", async () => {
    await act(async () => root.render(createElement(OperatorDepthPreview, { surface: "actions" })));
    const approve = [...container.querySelectorAll("button")].find(button => button.textContent === "Approve");
    expect(approve).toBeDefined(); await act(async () => approve!.click());
    expect(container.textContent).not.toContain("Clarify how to request a session");
    expect(calls.server).not.toHaveBeenCalled(); expect(calls.fetch).not.toHaveBeenCalled();
  });
  it("keeps payment creates and revokes in the transport instance only", async () => {
    const request = createOperatorDepthTransport();
    const initial = operatorDepthPayLinks();
    await request("/api/admin/pay-links", { method: "POST", body: JSON.stringify({ slug: "new-fictional-link", clientName: "Example studio", amountCents: 25000 }) });
    const created = await (await request("/api/admin/pay-links")).json();
    expect(created.payLinks).toHaveLength(initial.length + 1);
    await request("/api/admin/pay-links?slug=new-fictional-link", { method: "DELETE" });
    expect((await (await request("/api/admin/pay-links")).json()).payLinks).toEqual(initial);
    expect((await (await createOperatorDepthTransport()("/api/admin/pay-links")).json()).payLinks).toEqual(initial);
    expect(calls.fetch).not.toHaveBeenCalled();
  });
  it("never delegates unknown reads, arbitrary clients or malformed writes", async () => {
    const request = createOperatorDepthTransport();
    for (const input of ["https://payments.example/charge", "/api/admin/owner-invite", "/api/admin/unknown"]) expect((await request(input, { method: "POST" })).status).toBe(404);
    expect((await request("/api/admin/scan", { method: "POST", body: JSON.stringify({ tenant: "not-a-fictional-client" }) })).status).toBe(404);
    expect((await request("/api/admin/provision", { method: "POST", body: "bad json" })).status).toBe(400);
    expect(calls.fetch).not.toHaveBeenCalled();
  });
  it("shows fictional completion without restoring or saving a provisioning result", async () => {
    const storageRead = vi.spyOn(Storage.prototype, "getItem");
    const storageWrite = vi.spyOn(Storage.prototype, "setItem");
    await act(async () => root.render(createElement(OperatorDepthPreview, { surface: "onboard", result: true })));
    expect(container.textContent).toContain("fictional-studio");
    expect(storageRead).not.toHaveBeenCalled(); expect(storageWrite).not.toHaveBeenCalled();
    storageRead.mockRestore(); storageWrite.mockRestore();
  });
});
