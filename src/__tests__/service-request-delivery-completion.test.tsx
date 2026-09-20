// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { OfferingInstallation } from "@/platform/offerings";
import type { ServiceRequest } from "@/platform/service-requests";
import { ServiceRequestDeliveryCompletion } from "@/experience/workspace/ServiceRequestDeliveryCompletion";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";

const businessId = "10000000-0000-4000-8000-000000000001";
const requestId = "10000000-0000-4000-8000-000000000002";
const installationId = "10000000-0000-4000-8000-000000000003";
const applicationId = "10000000-0000-4000-8000-000000000004";
const agencyId = "10000000-0000-4000-8000-000000000005";
const ownerId = "10000000-0000-4000-8000-000000000006";

const request: ServiceRequest = {
  id: requestId, businessId, status: "requested", request: "Prepare the staff request flow.", outcome: "A reviewable request path.",
  context: {}, scope: ["submit_requests", "review_requests"], provider: { kind: "agency", agencyWorkspaceId: agencyId },
  providerAcceptance: { status: "accepted", actorId: ownerId, acceptedAt: "2026-09-20T12:00:00.000Z", note: null },
  installationId: null, deliveryId: null, revision: 2, createdBy: ownerId, createdAt: "2026-09-20T12:00:00.000Z", updatedAt: "2026-09-20T12:00:00.000Z",
};

const installation: OfferingInstallation = {
  id: installationId, businessId, definitionId: "private_staff_requests", definitionVersion: "1.0.0", status: "active", revision: 2,
  configuration: {}, nativeResources: [{ kind: "application", id: applicationId }],
  responsibility: { kind: "provider_requested", providerKind: "agency", providerName: "Northstar Agency", agencyWorkspaceId: agencyId },
  acceptedScope: ["submit_requests", "review_requests"], surfaces: [], installedBy: ownerId, installedAt: "2026-09-20T12:00:00.000Z",
  updatedBy: ownerId, updatedAt: "2026-09-20T12:00:00.000Z",
};

const acceptedDelivery = {
  id: "40000000-0000-4000-8000-000000000001",
  businessId,
  installationId,
  assignmentId: "40000000-0000-4000-8000-000000000002",
  status: "accepted" as const,
  scope: [...installation.acceptedScope],
  revision: 1,
  expiresAt: "2026-09-27T12:00:00.000Z",
};

const acceptedAssignment = {
  id: acceptedDelivery.assignmentId,
  status: "accepted" as const,
  assigneeEmail: "operator@northstar.test",
  expiresAt: acceptedDelivery.expiresAt,
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("service request delivery completion", () => {
  let root: Root;
  let container: HTMLDivElement;
  let pending: Array<{ url: string; init?: RequestInit; resolve: (value: Response) => void }>;

  beforeEach(() => {
    pending = [];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("requires exact accepted scope and resource before offering a named agency assignment", async () => {
    const transport = (input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((resolve) => {
      pending.push({ url: String(input), init, resolve });
    });
    await act(async () => root.render(createElement(
      WorkspaceRequestContext.Provider,
      { value: transport },
      createElement(ServiceRequestDeliveryCompletion, { request, installation, responsibilities: [{ id: "20000000-0000-4000-8000-000000000001", title: "Approved request work" }] }),
    )));
    expect(pending[0]!.url).toContain("/api/offerings/provider-delivery");
    await act(async () => pending[0]!.resolve(response({ deliveries: [] })));

    const checkboxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect(checkboxes).toHaveLength(3);
    const create = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.includes("Create exact provider assignment"))!;
    expect(create.disabled).toBe(true);
    await act(async () => checkboxes.forEach((checkbox) => checkbox.click()));
    const email = container.querySelector<HTMLInputElement>('input[type="email"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(email, "operator@northstar.test");
      email.dispatchEvent(new Event("input", { bubbles: true }));
      email.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => create.click());
    expect(pending[1]!.url).toBe("/api/operational-assignments");
    expect(JSON.parse(String(pending[1]!.init?.body))).toMatchObject({
      action: "offer", workId: "20000000-0000-4000-8000-000000000001",
      assignment: { assigneeKind: "agency", agencyWorkspaceId: agencyId, assigneeEmail: "operator@northstar.test" },
    });
    await act(async () => pending[1]!.resolve(response({ id: "30000000-0000-4000-8000-000000000001", status: "offered", expiresAt: "2026-09-27T12:00:00.000Z" })));
    expect(pending[2]!.url).toBe("/api/offerings/provider-delivery");
    expect(JSON.parse(String(pending[2]!.init?.body))).toMatchObject({ action: "request", businessId, installationId });
  });

  it("withholds draft access when the assigned work read fails and exposes retry", async () => {
    const transport = (input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((resolve) => {
      pending.push({ url: String(input), init, resolve });
    });
    await act(async () => root.render(createElement(
      WorkspaceRequestContext.Provider,
      { value: transport },
      createElement(ServiceRequestDeliveryCompletion, { request, installation, responsibilities: [] }),
    )));
    await act(async () => pending[0]!.resolve(response({ deliveries: [acceptedDelivery] })));
    expect(pending[1]!.url).toContain("/api/operational-assignments");
    await act(async () => pending[1]!.resolve(response({ error: "temporarily unavailable" }, 503)));

    expect(container.textContent).toContain("The assigned work could not be loaded");
    expect(container.textContent).toContain("Assignment: unavailable");
    expect(Array.from(container.querySelectorAll("button")).some((button) => button.textContent?.includes("Grant draft editing"))).toBe(false);
    expect(Array.from(container.querySelectorAll("button")).some((button) => button.textContent?.includes("Try again"))).toBe(true);
  });

  it("withholds grant and revoke controls when draft access read fails", async () => {
    const transport = (input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((resolve) => {
      pending.push({ url: String(input), init, resolve });
    });
    await act(async () => root.render(createElement(
      WorkspaceRequestContext.Provider,
      { value: transport },
      createElement(ServiceRequestDeliveryCompletion, { request, installation, responsibilities: [] }),
    )));
    await act(async () => pending[0]!.resolve(response({ deliveries: [acceptedDelivery] })));
    await act(async () => pending[1]!.resolve(response({ assignment: acceptedAssignment, responsibility: { payload: { status: "completed" } } })));
    expect(pending[2]!.url).toContain("/api/agency-application-draft-access");
    await act(async () => pending[2]!.resolve(response({ error: "temporarily unavailable" }, 503)));

    expect(container.textContent).toContain("Draft editing access could not be loaded");
    expect(Array.from(container.querySelectorAll("button")).some((button) => button.textContent?.includes("Grant draft editing"))).toBe(false);
    expect(Array.from(container.querySelectorAll("button")).some((button) => button.textContent?.includes("Revoke draft editing"))).toBe(false);
    expect(Array.from(container.querySelectorAll("button")).some((button) => button.textContent?.includes("Try again"))).toBe(true);
  });
});
