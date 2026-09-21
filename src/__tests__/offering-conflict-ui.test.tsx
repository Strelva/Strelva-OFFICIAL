// @vitest-environment jsdom
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OfferingCollection, OfferingInstallation } from "@/platform/offerings";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
import { WorkspaceOfferingDirectory, useWorkspaceOfferings } from "@/experience/workspace/WorkspaceOfferings";

const businessId = "11111111-1111-4111-8111-111111111111";
const secondBusinessId = "44444444-4444-4444-8444-444444444444";
const installationId = "33333333-3333-4333-8333-333333333333";
const applicationId = "22222222-2222-4222-8222-222222222222";

const definition = {
  id: "private_staff_requests",
  version: "1.0.0",
  name: "Staff request application",
  description: "Collect staff requests in a released private application.",
  availability: "local" as const,
  installability: "available" as const,
  installationNote: "Installation keeps publishing explicit.",
  requiredResources: [{ kind: "application" as const, minimum: 1, maximum: 1, description: "A released application." }],
  scopes: [{ id: "submit_requests", label: "Submit requests", description: "Add request records.", required: true }],
  surfaces: [{ id: "staff_app", label: "Staff application", description: "The staff form.", href: null, required: true }],
  configurationFields: [{ id: "displayName", label: "Display name", kind: "short_text" as const, required: false, maximumLength: 80 }],
};

const work = {
  id: applicationId,
  workspaceId: businessId,
  title: "Staff requests",
  productId: "applications",
  resourceKind: "application",
  payload: null,
  input: {},
  createdAt: "2026-09-15T12:00:00.000Z",
};

function installation(revision: number, displayName: string, currentBusinessId = businessId): OfferingInstallation {
  return {
    id: installationId,
    businessId: currentBusinessId,
    definitionId: definition.id,
    definitionVersion: definition.version,
    status: "active",
    revision,
    configuration: { displayName },
    nativeResources: [{ kind: "application", id: applicationId }],
    responsibility: { kind: "customer_operated", providerName: "Harbor Dental" },
    acceptedScope: ["submit_requests"],
    surfaces: [],
    installedBy: "owner",
    installedAt: "2026-09-15T12:00:00.000Z",
    updatedBy: "owner",
    updatedAt: "2026-09-15T12:00:00.000Z",
  };
}

function collection(saved: OfferingInstallation, currentBusinessId = saved.businessId): OfferingCollection {
  return {
    businessId: currentBusinessId,
    permissions: { canRead: true, canManage: true, role: "owner" },
    definitions: [definition],
    installations: [saved],
    websiteBindings: [],
  };
}

type Pending = { url: string; init?: RequestInit; resolve: (response: Response) => void };
type Controller = ReturnType<typeof useWorkspaceOfferings>;

let root: Root;
let container: HTMLDivElement;
let pending: Pending[];
let controllers: Controller[];
let transport: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function Editor({ index, currentBusinessId = businessId }: { index: number; currentBusinessId?: string }) {
  const offerings = useWorkspaceOfferings({ businessId: currentBusinessId, enabled: true, unavailableReason: "Unavailable" });
  useEffect(() => { controllers[index] = offerings; }, [index, offerings]);
  return createElement(WorkspaceOfferingDirectory, {
    state: offerings.state,
    businessName: "Harbor Dental",
    work: [work],
    managedSites: [],
    selectedId: installationId,
    onSelect: () => undefined,
    onOpenWork: () => undefined,
    onRetry: () => undefined,
    onRetryConflict: offerings.retryConflict,
    onCommand: offerings.command,
    onWebsiteCommand: offerings.websiteCommand,
  });
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function renderEditors() {
  const view = createElement("div", null, createElement(Editor, { index: 0 }), createElement(Editor, { index: 1 }));
  act(() => root.render(createElement(WorkspaceRequestContext.Provider, { value: transport }, view)));
}

function renderEditor(currentBusinessId: string) {
  act(() => root.render(createElement(WorkspaceRequestContext.Provider, { value: transport }, createElement(Editor, { index: 0, currentBusinessId }))));
}

async function resolvePending(index: number, body: unknown, status = 200) {
  await act(async () => pending[index]!.resolve(response(body, status)));
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  pending = [];
  controllers = [];
  transport = (input, init) => new Promise<Response>((resolve) => {
    pending.push({ url: typeof input === "string" ? input : input.toString(), init, resolve });
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("offering editor conflict recovery", () => {
  it("refreshes editor B to revision 2, keeps its draft beside the saved value, and only retries after an explicit save", async () => {
    await renderEditors();
    expect(pending).toHaveLength(2);
    await act(async () => {
      pending[0]!.resolve(response(collection(installation(1, "Original"))));
      pending[1]!.resolve(response(collection(installation(1, "Original"))));
    });

    const fields = container.querySelectorAll<HTMLInputElement>('input[maxlength="80"]');
    expect(fields).toHaveLength(2);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(fields[1], "Editor B draft");
      fields[1]!.dispatchEvent(new Event("input", { bubbles: true }));
      fields[1]!.dispatchEvent(new Event("change", { bubbles: true }));
    });

    let editorACommand!: Promise<OfferingInstallation | null>;
    act(() => { editorACommand = controllers[0]!.command({
      action: "update_configuration",
      businessId,
      installationId,
      expectedRevision: 1,
      configuration: { displayName: "Editor A saved" },
    }); });
    expect(pending[2]!.init?.body).toContain('"expectedRevision":1');
    await resolvePending(2, { installation: installation(2, "Editor A saved") });
    await editorACommand;

    const saveButtons = container.querySelectorAll<HTMLButtonElement>('form button[type="submit"]');
    expect(saveButtons).toHaveLength(2);
    act(() => saveButtons[1]!.click());
    expect(pending[3]!.init?.body).toContain('"expectedRevision":1');
    await resolvePending(3, { error: { code: "installation_conflict", message: "This offering changed while you were editing." } }, 409);
    expect(pending[4]!.url).toContain("/api/offerings?businessId=");
    await resolvePending(4, collection(installation(2, "Editor A saved")));

    expect(container.textContent).toContain("This offering changed while you were editing.");
    expect(container.textContent).toContain("Latest saved: Editor A saved");
    expect(container.textContent).toContain("Your draft: Editor B draft");
    expect(container.querySelectorAll('button[type="submit"]')).toHaveLength(2);
    expect(pending).toHaveLength(5);

    act(() => container.querySelectorAll<HTMLButtonElement>('form button[type="submit"]')[1]!.click());
    expect(pending[5]!.init?.body).toContain('"expectedRevision":2');
    expect(pending[5]!.init?.body).toContain("Editor B draft");
    await resolvePending(5, { installation: installation(3, "Editor B draft") });
  });

  it("ignores an offering response from the previous business after the workspace changes", async () => {
    renderEditor(businessId);
    expect(pending).toHaveLength(1);
    renderEditor(secondBusinessId);
    expect(pending).toHaveLength(2);

    await resolvePending(0, collection(installation(1, "Old business", businessId)));
    expect(container.querySelector('input[maxlength="80"]')).toBeNull();

    await resolvePending(1, collection(installation(1, "New business", secondBusinessId), secondBusinessId));
    expect(container.querySelector<HTMLInputElement>('input[maxlength="80"]')?.value).toBe("New business");
  });

  it("does not retry against the stale revision when the conflict refresh fails", async () => {
    renderEditor(businessId);
    expect(pending).toHaveLength(1);
    await resolvePending(0, collection(installation(1, "Original")));

    const field = container.querySelector<HTMLInputElement>('input[maxlength="80"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, "Keep this draft");
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
    });

    let command!: Promise<OfferingInstallation | null>;
    act(() => { command = controllers[0]!.command({
      action: "update_configuration",
      businessId,
      installationId,
      expectedRevision: 1,
      configuration: { displayName: "Keep this draft" },
    }); });
    await resolvePending(1, { error: { code: "installation_conflict", message: "This offering changed while you were editing." } }, 409);
    await resolvePending(2, { error: { code: "source_unavailable", message: "The latest offering version could not be loaded." } }, 503);
    await command;

    expect(container.textContent).toContain("The latest saved version could not be loaded");
    expect(container.querySelector<HTMLInputElement>('input[maxlength="80"]')?.value).toBe("Keep this draft");
    const save = container.querySelector<HTMLButtonElement>('form button[type="submit"]')!;
    expect(save.disabled).toBe(true);
    expect(pending.filter((item) => item.url.endsWith("/api/offerings"))).toHaveLength(1);

    const refresh = [...container.querySelectorAll<HTMLButtonElement>('button[type="button"]')].find((button) => button.textContent?.includes("Refresh latest version"));
    expect(refresh).toBeDefined();
    act(() => refresh!.click());
    expect(pending[3]!.url).toContain("/api/offerings?businessId=");
    await resolvePending(3, collection(installation(2, "Editor A saved")));
    expect(container.textContent).toContain("Latest saved: Editor A saved");
    expect(container.textContent).toContain("Your draft: Keep this draft");
    expect(save.disabled).toBe(false);
    act(() => save.click());
    expect(pending[4]!.init?.body).toContain('"expectedRevision":2');
  });
});
