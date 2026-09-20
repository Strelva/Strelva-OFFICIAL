// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { OfferingCollection, OfferingInstallation } from "@/platform/offerings";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
import { BusinessOfferingSummary } from "@/experience/workspace/WorkspaceOfferings";
import { createPreviewRequest } from "@/experience/workspace/preview/fixture";

const firstBusinessId = "11111111-1111-4111-8111-111111111111";
const secondBusinessId = "44444444-4444-4444-8444-444444444444";
const firstInstallationId = "22222222-2222-4222-8222-222222222222";
const secondInstallationId = "33333333-3333-4333-8333-333333333333";
const thirdInstallationId = "55555555-5555-4555-8555-555555555555";

const definition = {
  id: "private_staff_requests",
  version: "1.0.0",
  name: "Provider workflow",
  description: "A provider-operated workflow.",
  availability: "local" as const,
  installability: "available" as const,
  installationNote: "",
  requiredResources: [],
  scopes: [],
  surfaces: [],
  configurationFields: [],
};

function installation(id: string, businessId: string): OfferingInstallation {
  return {
    id,
    businessId,
    definitionId: definition.id,
    definitionVersion: definition.version,
    status: "active",
    revision: 1,
    configuration: {},
    nativeResources: [],
    responsibility: { kind: "provider_requested", providerKind: "strelva", providerName: "Strelva" },
    acceptedScope: [],
    surfaces: [],
    installedBy: "owner",
    installedAt: "2026-09-15T12:00:00.000Z",
    updatedBy: "owner",
    updatedAt: "2026-09-15T12:00:00.000Z",
  };
}

function collection(businessId: string, installations: OfferingInstallation[]): OfferingCollection {
  return {
    businessId,
    permissions: { canRead: true, canManage: true, role: "owner" },
    definitions: [definition],
    installations,
    websiteBindings: [],
  };
}

function delivery(installationId: string, status: "requested" | "accepted" | "revoked", customerDecision: "pending" | "confirmed" | "changes_requested") {
  return { installationId, status, customerDecision };
}

type Pending = { url: string; resolve: (response: Response) => void };

let root: Root;
let container: HTMLDivElement;
let pending: Pending[];
let transport: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function renderSummary(businessId: string, installationIds: string[]) {
  const installations = installationIds.map((id) => installation(id, businessId));
  act(() => root.render(createElement(
    WorkspaceRequestContext.Provider,
    { value: transport },
    createElement(BusinessOfferingSummary, {
      state: { status: "ready", collection: collection(businessId, installations), saving: false },
      work: [],
      onOpen: () => undefined,
    }),
  )));
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  pending = [];
  transport = (input) => new Promise<Response>((resolve) => {
    pending.push({ url: typeof input === "string" ? input : input.toString(), resolve });
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("business provider summary", () => {
  it("uses one business delivery list and ignores a late response after the business changes", async () => {
    renderSummary(firstBusinessId, [firstInstallationId, secondInstallationId]);
    expect(pending).toHaveLength(1);
    expect(pending[0]!.url).toContain(`/api/offerings/provider-delivery?businessId=${firstBusinessId}`);

    renderSummary(secondBusinessId, [thirdInstallationId]);
    expect(pending).toHaveLength(2);
    expect(pending[1]!.url).toContain(`/api/offerings/provider-delivery?businessId=${secondBusinessId}`);

    await act(async () => pending[0]!.resolve(response({ deliveries: [delivery(firstInstallationId, "accepted", "confirmed")] })));
    expect(container.textContent).not.toContain("Provider accepted");

    await act(async () => pending[1]!.resolve(response({ deliveries: [delivery(thirdInstallationId, "requested", "pending")] })));
    expect(container.textContent).toContain("Provider requested · waiting for acceptance");
    expect(container.textContent).toContain("Customer decision: pending");
    expect(pending).toHaveLength(2);
  });

  it("shows unavailable instead of inferring acceptance when the delivery endpoint fails", async () => {
    renderSummary(firstBusinessId, [firstInstallationId]);
    expect(pending).toHaveLength(1);
    await act(async () => pending[0]!.resolve(response({ error: { message: "Provider list unavailable" } }, 503)));
    expect(container.textContent).toContain("Provider delivery status is unavailable");
    expect(container.textContent).toContain("Acceptance cannot be inferred from the offering record.");
    expect(container.textContent).not.toContain("Provider accepted");
  });

  it("serves the preview delivery list and records requested, accepted, revoked, and customer decisions", async () => {
    const request = createPreviewRequest("business", { installedStaffRequest: true });
    const endpoint = "/api/offerings/provider-delivery?businessId=33333333-3333-4333-8333-333333333333";
    const initial = await request(endpoint);
    expect(initial.status).toBe(200);
    expect((await initial.json()).deliveries[0]).toMatchObject({ status: "requested", customerDecision: "pending" });

    const accepted = await request("/api/offerings/provider-delivery", { method: "POST", body: JSON.stringify({ action: "accept" }) });
    expect(accepted.status).toBe(200);
    expect((await accepted.json()).delivery).toMatchObject({ status: "accepted" });

    const decided = await request("/api/offerings/provider-delivery", { method: "POST", body: JSON.stringify({ action: "decide", decision: "confirmed" }) });
    expect(decided.status).toBe(200);
    expect((await decided.json()).delivery).toMatchObject({ status: "accepted", customerDecision: "confirmed" });

    const revoked = await request("/api/offerings/provider-delivery", { method: "POST", body: JSON.stringify({ action: "revoke" }) });
    expect(revoked.status).toBe(200);
    expect((await revoked.json()).delivery).toMatchObject({ status: "revoked", customerDecision: "confirmed" });
  });
});
