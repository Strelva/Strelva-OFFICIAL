// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceHelp } from "@/experience/workspace/WorkspaceHelp";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";

const businessId = "10000000-0000-4000-8000-000000000001";
const secondBusinessId = "10000000-0000-4000-8000-000000000006";
const requestId = "10000000-0000-4000-8000-000000000002";

type Pending = { init?: RequestInit; resolve: (response: Response) => void };
let container: HTMLDivElement;
let root: Root;
let pending: Pending[];

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const saved = {
  id: requestId,
  businessId,
  status: "requested",
  request: "Prepare a private request flow.",
  outcome: "Prepare a private request flow.",
  context: { source: "workspace_help" },
  scope: ["provider_defined_scope"],
  provider: { kind: "strelva" },
  providerAcceptance: { status: "pending", actorId: null, acceptedAt: null, note: null },
  installationId: null,
  deliveryId: null,
  revision: 1,
  createdBy: "10000000-0000-0000-8000-000000000005",
  createdAt: "2026-09-19T12:00:00.000Z",
  updatedAt: "2026-09-19T12:00:00.000Z",
};

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

describe("workspace help service request", () => {
  it("saves one clear request while deriving the outcome and keeping acceptance pending", async () => {
    const transport = (input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((resolve) => {
      expect(String(input)).toContain("/api/service-requests");
      pending.push({ init, resolve });
    });
    await act(async () => root.render(createElement(
      WorkspaceRequestContext.Provider,
      { value: transport },
      createElement(WorkspaceHelp, { workspaceId: businessId, workspaceName: "Harbor Dental" }),
    )));
    expect(pending).toHaveLength(1);
    expect(pending[0]!.init?.method).toBeUndefined();
    await act(async () => pending[0]!.resolve(response({ requests: [] })));

    const field = container.querySelector<HTMLTextAreaElement>("#capability-request")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, "Prepare a private request flow.");
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => { container.querySelector<HTMLButtonElement>('button[type="button"]')!.click(); });
    expect(pending).toHaveLength(2);
    const body = JSON.parse(String(pending[1]!.init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ action: "save", businessId, status: "requested", request: "Prepare a private request flow.", outcome: "Prepare a private request flow.", provider: { kind: "strelva" } });
    expect(body).not.toHaveProperty("agencyWorkspaceId");

    await act(async () => pending[1]!.resolve(response({ request: saved })));
    expect(container.textContent).toContain("Saved for review.");
    expect(container.textContent).toContain("does not mean a provider accepted it");

    await act(async () => root.render(null));
    await act(async () => root.render(createElement(
      WorkspaceRequestContext.Provider,
      { value: transport },
      createElement(WorkspaceHelp, { workspaceId: businessId, workspaceName: "Harbor Dental" }),
    )));
    expect(pending).toHaveLength(3);
    await act(async () => pending[2]!.resolve(response({ requests: [saved] })));
    const savedRow = container.querySelector<HTMLButtonElement>("ul button")!;
    expect(savedRow.textContent).toContain("Pending provider review");
    expect(savedRow.textContent).toContain("Strelva");
    expect(savedRow.textContent).not.toContain("help_request");
    await act(async () => savedRow.click());
    expect(container.querySelector<HTMLTextAreaElement>("#capability-request")?.value).toBe(saved.request);
    const reopenedField = container.querySelector<HTMLTextAreaElement>("#capability-request")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(reopenedField, "Prepare a revised private request flow.");
      reopenedField.dispatchEvent(new Event("input", { bubbles: true }));
      reopenedField.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => { container.querySelector<HTMLButtonElement>('button[type="button"]')!.click(); });
    expect(pending).toHaveLength(4);
    const updateBody = JSON.parse(String(pending[3]!.init?.body)) as Record<string, unknown>;
    expect(updateBody).toMatchObject({ action: "save", requestId: saved.id, expectedRevision: 1, request: "Prepare a revised private request flow." });
    expect(updateBody.context).toEqual(saved.context);
    expect(updateBody.scope).toEqual(saved.scope);
  });

  it("clears the previous workspace list and ignores a late list response after switching businesses", async () => {
    const transport = (input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((resolve) => {
      expect(String(input)).toContain("/api/service-requests");
      pending.push({ init, resolve });
    });
    await act(async () => root.render(createElement(
      WorkspaceRequestContext.Provider,
      { value: transport },
      createElement(WorkspaceHelp, { workspaceId: businessId, initialRequest: "Old request" }),
    )));
    expect(pending).toHaveLength(1);
    await act(async () => root.render(createElement(
      WorkspaceRequestContext.Provider,
      { value: transport },
      createElement(WorkspaceHelp, { workspaceId: secondBusinessId, initialRequest: "New request" }),
    )));
    expect(pending[0]!.init?.signal).toBeInstanceOf(AbortSignal);
    expect((pending[0]!.init?.signal as AbortSignal).aborted).toBe(true);
    expect(pending).toHaveLength(2);
    expect(container.querySelector<HTMLTextAreaElement>("#capability-request")?.value).toBe("New request");
    await act(async () => pending[0]!.resolve(response({ requests: [saved] })));
    expect(container.textContent).not.toContain(saved.request);
    await act(async () => pending[1]!.resolve(response({ requests: [{ ...saved, id: "10000000-0000-4000-8000-000000000007", businessId: secondBusinessId, request: "New persisted request" }] })));
    expect(container.textContent).toContain("New persisted request");
  });

  it("offers only server-provided agency recipients and persists the selected provider", async () => {
    const transport = (input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((resolve) => {
      expect(String(input)).toContain("/api/service-requests");
      pending.push({ init, resolve });
    });
    const agencyId = "20000000-0000-4000-8000-000000000001";
    await act(async () => root.render(createElement(
      WorkspaceRequestContext.Provider,
      { value: transport },
      createElement(WorkspaceHelp, {
        workspaceId: businessId,
        providerOptions: [
          { label: "Strelva", provider: { kind: "strelva" } },
          { label: "North Studio", provider: { kind: "agency", agencyWorkspaceId: agencyId } },
        ],
      }),
    )));
    await act(async () => pending[0]!.resolve(response({ requests: [] })));
    const selector = container.querySelector<HTMLSelectElement>("#request-provider")!;
    expect(Array.from(selector.options).map((option) => option.textContent)).toEqual(["Strelva", "North Studio"]);
    await act(async () => {
      selector.value = JSON.stringify({ kind: "agency", agencyWorkspaceId: agencyId });
      selector.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const field = container.querySelector<HTMLTextAreaElement>("#capability-request")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, "Review a private request flow.");
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => { container.querySelector<HTMLButtonElement>('button[type="button"]')!.click(); });
    const body = JSON.parse(String(pending[1]!.init?.body)) as Record<string, unknown>;
    expect(body.provider).toEqual({ kind: "agency", agencyWorkspaceId: agencyId });
  });

  it("keeps a saved agency provider when that agency is no longer in the current options", async () => {
    const transport = (input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((resolve) => {
      expect(String(input)).toContain("/api/service-requests");
      pending.push({ init, resolve });
    });
    const agencyId = "20000000-0000-4000-8000-000000000002";
    const agencySaved = {
      ...saved,
      provider: { kind: "agency" as const, agencyWorkspaceId: agencyId },
      context: { source: "agency_intake", originalDetail: "Keep this context" },
      scope: ["agency_defined_scope"],
    };
    await act(async () => root.render(createElement(
      WorkspaceRequestContext.Provider,
      { value: transport },
      createElement(WorkspaceHelp, {
        workspaceId: businessId,
        providerOptions: [{ label: "Strelva", provider: { kind: "strelva" } }],
      }),
    )));
    await act(async () => pending[0]!.resolve(response({ requests: [agencySaved] })));
    await act(async () => container.querySelector<HTMLButtonElement>("ul button")!.click());
    const selector = container.querySelector<HTMLSelectElement>("#request-provider")!;
    expect(Array.from(selector.options).map((option) => option.textContent)).toContain("Current agency");
    expect(selector.selectedOptions[0]?.textContent).toBe("Current agency");
    expect(selector.value).toBe(JSON.stringify(agencySaved.provider));
    const field = container.querySelector<HTMLTextAreaElement>("#capability-request")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, "Revise the agency request.");
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => { container.querySelector<HTMLButtonElement>('button[type="button"]')!.click(); });
    const body = JSON.parse(String(pending[1]!.init?.body)) as Record<string, unknown>;
    expect(body.provider).toEqual(agencySaved.provider);
    expect(body.context).toEqual(agencySaved.context);
    expect(body.scope).toEqual(agencySaved.scope);
  });

  it("shows withdrawn requests as read-only instead of pending review", async () => {
    const transport = (input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((resolve) => {
      expect(String(input)).toContain("/api/service-requests");
      pending.push({ init, resolve });
    });
    const withdrawn = { ...saved, status: "withdrawn" as const };
    await act(async () => root.render(createElement(
      WorkspaceRequestContext.Provider,
      { value: transport },
      createElement(WorkspaceHelp, { workspaceId: businessId }),
    )));
    await act(async () => pending[0]!.resolve(response({ requests: [withdrawn] })));
    const row = container.querySelector<HTMLButtonElement>("ul button")!;
    expect(row.textContent).toContain("Withdrawn");
    expect(row.textContent).not.toContain("Pending provider review");
    await act(async () => row.click());
    const saveButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) => ["Saved", "Save request"].includes(button.textContent || ""));
    expect(saveButton?.disabled).toBe(true);
    expect(container.textContent).toContain("It cannot be edited.");
  });

  it("does not paint a late save response into the newly selected workspace", async () => {
    const transport = (input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((resolve) => {
      expect(String(input)).toContain("/api/service-requests");
      pending.push({ init, resolve });
    });
    await act(async () => root.render(createElement(
      WorkspaceRequestContext.Provider,
      { value: transport },
      createElement(WorkspaceHelp, { workspaceId: businessId }),
    )));
    await act(async () => pending[0]!.resolve(response({ requests: [] })));
    const field = container.querySelector<HTMLTextAreaElement>("#capability-request")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, "Request from the first business");
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => { container.querySelector<HTMLButtonElement>('button[type="button"]')!.click(); });
    expect(pending).toHaveLength(2);
    await act(async () => root.render(createElement(
      WorkspaceRequestContext.Provider,
      { value: transport },
      createElement(WorkspaceHelp, { workspaceId: secondBusinessId }),
    )));
    expect(pending).toHaveLength(3);
    await act(async () => pending[1]!.resolve(response({ request: saved })));
    expect(container.textContent).not.toContain("Saved for review.");
    await act(async () => pending[2]!.resolve(response({ requests: [] })));
    expect(container.textContent).not.toContain("Request from the first business");
  });
});
