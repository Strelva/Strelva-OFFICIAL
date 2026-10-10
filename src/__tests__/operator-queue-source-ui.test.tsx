// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueueItem } from "@/platform/operator-queue/contracts";
const mocks = vi.hoisted(() => ({ read: vi.fn(), run: vi.fn(), refresh: vi.fn(), result: vi.fn() }));
vi.mock("@/app/admin/queue/source-actions", () => ({ readQueueServiceRequestAction: mocks.read, runQueueSourceAction: mocks.run }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
import { QueueSourceActions } from "@/app/admin/queue/QueueSourceActions";
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  mocks.read.mockResolvedValue({ ok: true, request: { request: "Update our services page", outcome: "Show three new services", scope: ["Services page only", "Keep existing forms"], revision: 4 } });
  mocks.run.mockResolvedValue({ ok: true, message: "Handled" });
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
function render(kind: QueueItem["kind"]) { act(() => root.render(createElement(QueueSourceActions, { item: { key: "source:item", kind } as QueueItem, onResult: mocks.result }))); }
async function click(label: string) {
  const button = [...container.querySelectorAll("button")].find(button => button.textContent === label);
  expect(button).toBeDefined(); await act(async () => button!.click());
}
describe("queue source controls", () => {
  it("reads and displays the requested scope before accepting the reviewed revision", async () => {
    render("service_request"); expect(container.textContent).not.toContain("Accept request"); expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.run).not.toHaveBeenCalled();
    await click("Review request"); expect(container.textContent).toContain("Keep existing forms"); expect(container.textContent).toContain("Scope and deadline still need agreement");
    await click("Accept request"); expect(mocks.run).toHaveBeenCalledWith(expect.objectContaining({ key: "source:item", action: "accept_request", expectedRevision: 4 }));
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
  it("keeps the reviewed request on failure and presents the server reason", async () => {
    render("service_request"); await click("Review request"); mocks.run.mockResolvedValue({ ok: false, message: "The request changed. Review it again." });
    await click("Decline request"); expect(container.textContent).toContain("Keep existing forms"); expect(mocks.result).toHaveBeenCalledWith({ ok: false, message: "The request changed. Review it again." }); expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("never offers acceptance when the request cannot be read", async () => {
    mocks.read.mockResolvedValue({ ok: false, message: "Request unavailable" }); render("service_request"); await click("Review request");
    expect(container.textContent).not.toContain("Accept request"); expect(mocks.run).not.toHaveBeenCalled(); expect(mocks.result).toHaveBeenCalledWith({ ok: false, message: "Request unavailable" });
  });
  it.each([["lead_unkept", "Retry lead copy", "retry_lead"], ["site_health", "Recheck site", "check_health"], ["domain_unverified", "Recheck domain", "check_domain"], ["change_request", "Mark triaged", "triage"]] as const)("offers %s source work only after an explicit click", async (kind, label, action) => {
    render(kind); expect(mocks.run).not.toHaveBeenCalled(); await click(label); expect(mocks.run).toHaveBeenCalledWith(expect.objectContaining({ key: "source:item", action }));
  });
});
