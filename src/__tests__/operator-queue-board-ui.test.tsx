// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OperatorQueue, QueueItem } from "@/platform/operator-queue/contracts";

const mocks = vi.hoisted(() => ({ mark: vi.fn(), close: vi.fn(), drafts: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/app/admin/queue/actions", () => ({ markQueueItemAction: mocks.mark, closeQueueItemAction: mocks.close, resolveQueueDraftsAction: mocks.drafts }));
vi.mock("@/app/admin/queue/QueueSourceActions", () => ({ QueueSourceActions: () => null }));
vi.mock("@/components/dashboard/QueueEventDetail", () => ({ QueueEventDetail: () => null, hasQueueEventDetail: () => false }));
import { QueueBoard } from "@/app/admin/queue/QueueBoard";

const at = "2026-10-09T12:00:00.000Z";
function item(key: string, extra: Partial<QueueItem> = {}): QueueItem {
  return { key, kind: "service_request", sourceRef: key, business: { kind: "workspace", workspaceId: "business", name: "Fixture business", tenantId: null }, system: null,
    title: key, move: "strelva", priority: "P3", priorityReason: null, openedAt: at, ageMs: 60_000, dueAt: null, late: false,
    state: "open", assignee: null, pinned: false, snoozed: null, ownerReach: null, notes: [], href: "/admin/clients/business",
    receiptIds: [], closed: null, closedElsewhere: null, ...extra };
}
function queue(items: QueueItem[], extra: Partial<OperatorQueue> = {}): OperatorQueue {
  return { items, parked: [], gaps: [], complete: true, counts: [], operators: [], generatedAt: at, ...extra };
}
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
function render(value: OperatorQueue) { act(() => root.render(createElement(QueueBoard, { queue: value, me: "operator", actionsEnabled: true }))); }
async function click(label: string) {
  const button = [...container.querySelectorAll("button")].find(button => button.textContent === label);
  expect(button).toBeDefined(); await act(async () => button!.click());
}

describe("operator queue composition", () => {
  it("keeps Strelva's drafts in Now and owner/provider items in waiting, with harm and pins kept in Now", () => {
    render(queue([item("Strelva draft"), item("Owner decision", { move: "owner", priority: "P4" }), item("Provider response", { move: "provider" }), item("Harm now", { move: "owner", priority: "P1" }), item("Pinned", { move: "provider", pinned: true })]));
    const now = container.querySelector('ul[aria-label="Now"]');
    const waiting = container.querySelector('ul[aria-label="Waiting on someone else"]');
    expect(now?.textContent).toContain("Strelva draft"); expect(now?.textContent).toContain("Harm now"); expect(now?.textContent).toContain("Pinned");
    expect(waiting?.textContent).toContain("Owner decision"); expect(waiting?.textContent).toContain("Provider response");
    expect(waiting?.textContent).not.toContain("Strelva draft");
    expect(mocks.mark).not.toHaveBeenCalled(); expect(mocks.close).not.toHaveBeenCalled();
  });
  it("keeps the close reason and minutes form open after a server failure", async () => {
    mocks.close.mockResolvedValue({ ok: false, message: "This item changed. Review it again." });
    render(queue([item("A reviewed request")]));
    await click("A reviewed request"); await click("Close");
    const form = container.querySelector('form[aria-label="Close A reviewed request"]'); expect(form).not.toBeNull();
    await act(async () => form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(mocks.close).toHaveBeenCalledWith(expect.objectContaining({ key: "A reviewed request", state: "done" }));
    expect(container.querySelector('form[aria-label="Close A reviewed request"]')).not.toBeNull();
    expect(container.textContent).toContain("This item changed. Review it again."); expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("retains source gaps and parked items without claiming an empty queue is complete", async () => {
    render(queue([], { complete: false, gaps: [{ kind: "site_health", source: "Site health", reason: "Unavailable" }], parked: [item("Paused request", { snoozed: { until: at, reason: "Waiting for details" } })] }));
    expect(container.textContent).toContain("This list is incomplete."); expect(container.textContent).toContain("in the sources that could be read.");
    await click("Show"); expect(container.textContent).toContain("Snoozed: Waiting for details"); expect(container.textContent).toContain("Unsnooze");
  });
});
