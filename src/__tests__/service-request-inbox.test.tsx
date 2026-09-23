// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceRequestInbox } from "@/experience/operations/ServiceRequestInbox";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";

const request: Record<string, unknown> = {
  id: "10000000-0000-4000-8000-000000000002",
  businessId: "10000000-0000-4000-8000-000000000001",
  status: "requested",
  request: "Prepare a private request flow.",
  outcome: "A private request form and review path.",
  context: { workspaceName: "Harbor Dental" },
  scope: ["help_request"],
  provider: { kind: "strelva" },
  providerAcceptance: { status: "pending", actorId: null, acceptedAt: null, note: null },
  installationId: null,
  deliveryId: null,
  revision: 1,
  createdBy: "10000000-0000-4000-8000-000000000005",
  createdAt: "2026-09-19T12:00:00.000Z",
  updatedAt: "2026-09-19T12:00:00.000Z",
};

let root: Root;
let container: HTMLDivElement;
let pending: Array<{ url: string; init?: RequestInit; resolve: (value: Response) => void }>;

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  pending = [];
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((resolve) => {
    pending.push({ url: String(input), init, resolve });
  }));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("service request provider inbox", () => {
  it("loads pending requests and records an explicit acceptance", async () => {
    await act(async () => root.render(createElement(WorkspaceRequestContext.Provider, { value: fetch }, createElement(ServiceRequestInbox))));
    expect(pending[0]!.url).toBe("/api/service-requests?providerKind=strelva");
    await act(async () => pending[0]!.resolve(response({ requests: [request] })));
    expect(container.textContent).toContain("Prepare a private request flow.");
    expect(container.textContent).toContain("Needs your response");
    expect(container.textContent).not.toMatch(/Business [0-9a-f-]{36}/);

    const accept = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent === "Accept for review")!;
    await act(async () => accept.click());
    expect(pending[1]!.url).toBe("/api/service-requests");
    expect(JSON.parse(String(pending[1]!.init?.body))).toMatchObject({ action: "respond", requestId: request.id, expectedRevision: request.revision, decision: "accepted" });
    await act(async () => pending[1]!.resolve(response({ request: { ...request, providerAcceptance: { status: "accepted", actorId: request.createdBy, acceptedAt: "2026-09-19T12:01:00.000Z", note: null }, revision: 2 } })));
    expect(container.textContent).toContain("Accepted for review.");
    expect(container.textContent).toContain("No installation, price, authority, or execution was created.");
    expect(container.textContent).toContain("No pre-installation service requests are waiting");
  });

  it("does not paint a previous agency response after switching inboxes", async () => {
    const agencyA = "20000000-0000-4000-8000-000000000001";
    const agencyB = "20000000-0000-4000-8000-000000000002";
    await act(async () => root.render(createElement(
      WorkspaceRequestContext.Provider,
      { value: fetch },
      createElement(ServiceRequestInbox, { providerWorkspaceId: agencyA, surface: "workspace" }),
    )));
    expect(pending[0]!.url).toBe(`/api/service-requests?providerWorkspaceId=${agencyA}`);
    await act(async () => pending[0]!.resolve(response({ requests: [{ ...request, provider: { kind: "agency", agencyWorkspaceId: agencyA }, context: { workspaceName: "Agency A" } }] })));
    const accept = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent === "Accept for review")!;
    await act(async () => accept.click());
    expect(pending[1]!.url).toBe("/api/service-requests");

    await act(async () => root.render(createElement(
      WorkspaceRequestContext.Provider,
      { value: fetch },
      createElement(ServiceRequestInbox, { providerWorkspaceId: agencyB, surface: "workspace" }),
    )));
    expect(pending[2]!.url).toBe(`/api/service-requests?providerWorkspaceId=${agencyB}`);
    await act(async () => pending[1]!.resolve(response({ error: { message: "Agency A response failed." } }, 500)));
    expect(container.textContent).not.toContain("Agency A response failed.");
    expect(container.textContent).not.toContain("Accepted for review.");
    await act(async () => pending[2]!.resolve(response({ requests: [] })));
    expect(container.textContent).not.toContain("Agency A");
    expect(container.textContent).toContain("No pre-installation service requests are waiting");
  });
});
