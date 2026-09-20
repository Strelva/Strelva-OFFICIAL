// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResponsibilityExperience, StandingResponsibilityPicker } from "@/experience/operations/ResponsibilityExperience";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const workId = "22222222-2222-4222-8222-222222222222";
const sourceId = "33333333-3333-4333-8333-333333333333";
const standingId = "44444444-4444-4444-8444-444444444444";
const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const at = "2026-09-20T12:00:00.000Z";

let container: HTMLDivElement;
let root: Root;

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const sources = [{
  id: sourceId,
  workspaceId,
  title: "Supplier records",
  productId: "documents",
  resourceKind: "document",
  payload: null,
  input: {},
  createdAt: at,
}];

const uncertainWork = {
  id: workId,
  workspaceId,
  payload: {
    version: 1,
    revision: 3,
    title: "Update supplier records",
    intent: "Keep the supplier records current.",
    ownerId,
    approvedBy: ownerId,
    approvedAt: at,
    status: "needs_attention",
    createdAt: at,
    updatedAt: at,
    steps: [{
      id: "update",
      operation: "document.edit",
      workId: sourceId,
      input: { kind: "edit", expectedRevision: 0, title: "Supplier records", text: "Updated terms" },
      dependsOn: [],
      maximumCents: 0,
      capabilityVersion: 1,
      status: "unknown",
      attempt: 1,
      effect: "unknown",
      reason: "The document write may have completed. Verify it before trying again.",
    }],
    history: [],
  },
};

const standingView = {
  policy: {
    id: standingId,
    workspaceId,
    policy: {
      version: 1,
      revision: 2,
      title: "Check supplier records",
      intent: "Compare the saved records when asked.",
      status: "active",
      scope: { steps: [{ id: "check", operation: "investigation.run", workId: sourceId }] },
      trigger: { kind: "manual" },
      limits: { maxConcurrentJobs: 1, maxRuns: 10 },
      exclusions: [],
    },
  },
  jobs: [{ id: "job-1", finiteWorkId: workId, triggerKey: "manual:1", policyVersion: 1, status: "accepted", acceptedAt: at }],
  runs: [{
    id: "run-1",
    jobId: "job-1",
    finiteWorkId: workId,
    triggerKey: "manual:1",
    policyVersion: 1,
    status: "needs_attention",
    attempt: 1,
    createdAt: at,
    receipts: [{ stepId: "update", attempt: 1, status: "unknown", effect: "unknown" }],
  }],
};

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("stopped ongoing work recovery", () => {
  it("keeps finite readback and reconciliation while blocking new execution for an owner", async () => {
    const requests: Array<{ url: string; body?: Record<string, unknown> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") {
        requests.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> });
        return response(uncertainWork);
      }
      if (url.includes("/api/operations?workId=")) return response(uncertainWork);
      if (url.includes("/api/operational-assignments?workId=")) return response(null);
      throw new Error(`Unexpected request ${url}`);
    }));

    await act(async () => root.render(createElement(ResponsibilityExperience, {
      workspaceId,
      workId,
      sources,
      readOnly: false,
      newWorkBlocked: true,
      onSaved: vi.fn(),
    })));
    await vi.waitFor(() => expect(container.textContent).toContain("Update supplier records"));

    expect(container.textContent).toContain("Resolve an interrupted action");
    expect(container.textContent).toContain("New work is paused for this workspace.");
    expect(container.textContent).toContain("Cancel remaining work");
    expect(container.textContent).not.toContain("Continue approved work");
    expect(container.textContent).not.toContain("Approve and start this work");
    expect(container.textContent).not.toContain("Retry the failed step");
    expect(container.textContent).not.toContain("Read-only access.");

    const recoverySummary = Array.from(container.querySelectorAll<HTMLElement>("summary")).find(summary => summary.textContent === "Resolve an interrupted action");
    expect(recoverySummary).not.toBeUndefined();
    await act(async () => recoverySummary!.click());
    const evidence = container.querySelector<HTMLInputElement>('input[name="evidence"]');
    expect(evidence).not.toBeNull();
    await act(async () => {
      evidence!.value = "The customer confirmed the document now contains the updated terms.";
      evidence!.dispatchEvent(new Event("input", { bubbles: true }));
      evidence!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(button => button.textContent === "Record verified outcome")?.click());
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]!.body).toMatchObject({ action: "command", command: { kind: "reconcile" } });
    expect(requests.some(request => request.body?.action === "run")).toBe(false);
  });

  it("keeps standing exception recovery and cancellation while blocking run and approval", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/operations?standingId=")) return response(standingView);
      throw new Error(`Unexpected request ${url}`);
    }));

    await act(async () => root.render(createElement(ResponsibilityExperience, {
      workspaceId,
      standingId,
      sources,
      readOnly: false,
      newWorkBlocked: true,
      onSaved: vi.fn(),
    })));
    await vi.waitFor(() => expect(container.textContent).toContain("Check supplier records"));

    expect(container.textContent).toContain("Resolve an exception");
    expect(container.textContent).toContain("Stop");
    expect(container.textContent).toContain("New work is paused for this workspace.");
    expect(container.textContent).not.toContain("Run now");
    expect(container.textContent).not.toContain("Continue run");
    expect(container.textContent).not.toContain("Approve ongoing work");
  });

  it("does not expose recovery mutations to delegated read-only viewers", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/operations?workId=")) return response(uncertainWork);
      if (url.includes("/api/operational-assignments?workId=")) return response(null);
      throw new Error(`Unexpected request ${url}`);
    }));

    await act(async () => root.render(createElement(ResponsibilityExperience, {
      workspaceId,
      workId,
      sources,
      readOnly: true,
      newWorkBlocked: false,
      onSaved: vi.fn(),
    })));
    await vi.waitFor(() => expect(container.textContent).toContain("Update supplier records"));

    expect(container.textContent).toContain("Read-only access.");
    expect(container.textContent).not.toContain("Resolve an interrupted action");
    expect(container.textContent).not.toContain("Cancel remaining work");
  });

  it("hides the new ongoing work entry while retaining the existing list", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ responsibilities: [{
      id: standingId,
      workspaceId,
      policy: standingView.policy.policy,
    }] })));

    await act(async () => root.render(createElement(StandingResponsibilityPicker, {
      workspaceId,
      sources: [{ ...sources[0]!, productId: "investigations", resourceKind: "investigation", title: "Supplier records" }],
      selectedId: standingId,
      readOnly: false,
      newWorkBlocked: true,
      onOpen: vi.fn(),
      onCreated: vi.fn(),
    })));
    await vi.waitFor(() => expect(container.textContent).toContain("Check supplier records"));

    expect(container.textContent).toContain("New work is paused for this workspace.");
    expect(container.querySelector("button")?.textContent).not.toBe("New ongoing work");
    expect(container.textContent).not.toContain("Create ongoing work");
  });
});
