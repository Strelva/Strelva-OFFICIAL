// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceExit } from "@/experience/workspace/WorkspaceExit";

const firstWorkspace = "11111111-1111-4111-8111-111111111111";
const secondWorkspace = "22222222-2222-4222-8222-222222222222";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function options() {
  return { state: null, successors: [] };
}

function completedState(workspaceId: string) {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    workspaceId,
    status: "completed",
    requestedAt: "2026-09-20T14:00:00.000Z",
    completedAt: "2026-09-20T14:00:01.000Z",
    requestedBy: "44444444-4444-4444-8444-444444444444",
    futureWork: "paused",
    providerParticipation: "kept",
    maintainedResources: { kind: "stopped" },
    summary: { standingPaused: 0, standingRevoked: 0, scheduledPaused: 0, scheduledCancelled: 0, assignmentsRevoked: 0, providerDeliveriesRevoked: 0, investigationsPaused: 0, retainedAccepted: 0, retainedUnknown: 0 },
    retainedObligations: [],
    resources: [],
  };
}

describe("workspace exit request lifetime", () => {
  let root: Root;
  let container: HTMLDivElement;
  let pending: Array<{ input: RequestInfo | URL; init?: RequestInit; resolve: (value: Response) => void }>;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    pending = [];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it.each([false, true])("keeps billing consequences explicit with billing released %s, before and after leaving", async businessBillingReleased => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response(options()));
    await act(async () => root.render(createElement(WorkspaceExit, { workspaceId: firstWorkspace, request, businessBillingReleased })));
    const billingLink = () => container.querySelector(`a[href="/workspace/billing?workspaceId=${firstWorkspace}"]`);
    expect(Boolean(billingLink())).toBe(businessBillingReleased);
    expect(container.textContent).toContain("change billing or stop an outside service");
    if (!businessBillingReleased) expect(container.textContent).toContain("Contact your billing provider");
    await act(async () => root.render(null));
    request.mockResolvedValue(response({ state: completedState(firstWorkspace), successors: [] }));
    await act(async () => root.render(createElement(WorkspaceExit, { workspaceId: firstWorkspace, request, businessBillingReleased })));
    expect(Boolean(billingLink())).toBe(businessBillingReleased);
    expect(container.textContent).toContain("change billing or stop an outside service");
  });

  it("does not let an older completion overwrite the newly selected workspace", async () => {
    const request: typeof fetch = (input, init) => new Promise<Response>((resolve) => {
      pending.push({ input, init, resolve });
    });

    await act(async () => root.render(createElement(WorkspaceExit, { workspaceId: firstWorkspace, request })));
    await act(async () => pending.shift()!.resolve(response(options())));
    // One yes (October 16): a single press on "Leave Strelva" records the choice.
    const save = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent === "Leave Strelva");
    expect(save).toBeDefined();
    await act(async () => save!.click());
    expect(pending).toHaveLength(1);

    await act(async () => root.render(createElement(WorkspaceExit, { workspaceId: secondWorkspace, request })));
    expect(pending).toHaveLength(2);
    await act(async () => pending[1]!.resolve(response(options())));
    await act(async () => pending[0]!.resolve(response({ state: completedState(firstWorkspace), replayed: false })));

    expect(container.textContent).toContain("Leaving Strelva");
    expect(container.textContent).not.toContain("New work is paused.");
  });
  it("keeps a rejected exit choice editable and sends the original command shape", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(response(options())).mockResolvedValueOnce(response({ error: "The owner permission changed. Nothing was recorded." }, 403));
    await act(async () => root.render(createElement(WorkspaceExit, { workspaceId: firstWorkspace, request })));
    const confirm = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(button => button.textContent === "Leave Strelva")!;
    await act(async () => confirm.click());
    const sent = JSON.parse(String(request.mock.calls[1]![1]?.body));
    expect(sent).toMatchObject({ workspaceId: firstWorkspace, futureWork: "pause", providerParticipation: "keep", maintainedResources: { kind: "stop" } });
    expect(sent.idempotencyKey).toBeTruthy();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Nothing was recorded");
    expect(container.textContent).toContain("Leaving Strelva");
    expect(confirm.disabled).toBe(false);
  });

});
