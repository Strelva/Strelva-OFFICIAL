// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AgencyAuthoring } from "@/experience/workspace/agency/AgencyAuthoring";
import { AgencyVerification } from "@/experience/workspace/agency/AgencyOnboarding";
import type { AgencyClientRow } from "@/experience/workspace/agency-clients";
import type { WorkspaceSnapshot } from "@/experience/workspace/contracts";

const agencyId = "11111111-1111-4111-8111-111111111111";
const snapshot: WorkspaceSnapshot = {
  actor: { email: "author@example.test", localPreview: false }, workspaceId: agencyId,
  workspaces: [{ id: agencyId, name: "North Studio", kind: "agency", access: "member", role: "owner" }],
  work: [], handoffs: [], delegations: [], products: [], releases: { systems: true },
};
const client: AgencyClientRow = {
  workspaceId: "22222222-2222-4222-8222-222222222222", name: "The Mooney Firm", reach: "agency", role: "agency",
  provider: true, canBuild: false, status: "ready", systems: [], needsYou: { count: 0, oldestAt: null },
  openRequests: 0, improvementsWaiting: 0, lastReceiptAt: null,
};
const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
async function render(element: ReturnType<typeof createElement>) {
  const node = document.createElement("div"); document.body.appendChild(node);
  const root = createRoot(node); roots.push(root);
  await act(async () => root.render(element));
  return node;
}
const authoring = (clients: AgencyClientRow[]) => createElement(AgencyAuthoring, {
  request: vi.fn(), snapshot, clients, kind: "build", onOpenClientWork: vi.fn(),
});

it("explains the supported authoring path when an assigned client has no Build eligibility", async () => {
  const node = await render(authoring([client]));
  expect(node.querySelector("select")).toBeNull();
  expect(node.textContent).toContain("An agency owner or admin with current owner or admin authoring access");
  expect(node.textContent).toContain("Assigned staff open Clients");
  expect(node.textContent).toContain("editing an existing draft requires separate authorization from the client");
});

it("lists only ready clients with explicit server eligibility", async () => {
  const node = await render(authoring([
    client,
    { ...client, workspaceId: "33333333-3333-4333-8333-333333333333", name: "Eligible business", canBuild: true, role: "admin" },
    { ...client, workspaceId: "44444444-4444-4444-8444-444444444444", name: "Unavailable business", canBuild: true, status: "unavailable" },
    { ...client, workspaceId: "55555555-5555-4555-8555-555555555555", name: "Unconfirmed eligibility", canBuild: undefined },
  ]));
  expect([...node.querySelectorAll("option")].map(option => option.textContent)).toEqual(["Choose a client", "Eligible business"]);
});

it("qualifies the verification promise for owners, admins and assigned staff", async () => {
  const node = await render(createElement(AgencyVerification, { onboarding: {
    agency: { id: agencyId, name: "North Studio", role: "member" }, effects: [],
  } }));
  expect(node.textContent).toContain("Agency owners and admins can build, preview and rehearse in their agency");
  expect(node.textContent).toContain("open Build for a client and choose a business where you also have current owner or admin authoring access");
  expect(node.textContent).toContain("prepare only drafts the client has separately authorized");
  expect(node.textContent).not.toContain("You can build, preview and rehearse");
});
