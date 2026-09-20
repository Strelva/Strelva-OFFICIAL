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

  it("does not let an older completion overwrite the newly selected workspace", async () => {
    const request: typeof fetch = (input, init) => new Promise<Response>((resolve) => {
      pending.push({ input, init, resolve });
    });

    await act(async () => root.render(createElement(WorkspaceExit, { workspaceId: firstWorkspace, request })));
    await act(async () => pending.shift()!.resolve(response(options())));
    const save = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.includes("Save exit choice"));
    expect(save).toBeDefined();
    await act(async () => save!.click());
    expect(pending).toHaveLength(1);

    await act(async () => root.render(createElement(WorkspaceExit, { workspaceId: secondWorkspace, request })));
    expect(pending).toHaveLength(2);
    await act(async () => pending[1]!.resolve(response(options())));
    await act(async () => pending[0]!.resolve(response({ state: completedState(firstWorkspace), replayed: false })));

    expect(container.textContent).toContain("Prepare to leave this workspace");
    expect(container.textContent).not.toContain("New work is paused.");
  });
});
