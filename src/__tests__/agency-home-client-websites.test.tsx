// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgencyHome } from "@/experience/workspace/AgencyHome";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
import type { WorkspaceSnapshot } from "@/experience/workspace/contracts";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined }), usePathname: () => "/workspace", useSearchParams: () => new URLSearchParams() }));

const AGENCY = "11111111-1111-4111-8111-111111111111";
const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });

const snapshot = (keepYourSite: boolean): WorkspaceSnapshot => ({
  actor: { email: "ops@example.com", localPreview: false }, workspaceId: AGENCY,
  workspaces: [{ id: AGENCY, kind: "agency", name: "North Studio", access: "member", role: "owner" }],
  work: [], handoffs: [], delegations: [], products: [], releases: { systems: true, ...(keepYourSite ? { keepYourSite: true } : {}) },
});

async function render(keepYourSite: boolean, view: "home" | "clients") {
  const calls: string[] = [];
  const request = vi.fn<typeof fetch>(async input => {
    const url = String(input);
    calls.push(url);
    if (url.startsWith("/api/workspace/agency-client-sites")) return Response.json({ clients: [], nextCursor: null });
    if (url.startsWith("/api/workspace/agency-clients")) return Response.json({ agencyWorkspaceId: AGENCY, clients: [], queue: [], team: [], total: 0, nextCursor: null, providersRead: true });
    if (url.startsWith("/api/workspace/provider-client-queue")) return Response.json({ agencyWorkspaceId: AGENCY, items: [], nextCursor: null });
    return Response.json({ requests: [], applications: [], websites: [] });
  });
  const node = document.createElement("div"); document.body.appendChild(node);
  const root = createRoot(node); roots.push(root);
  await act(async () => root.render(createElement(WorkspaceRequestContext.Provider, { value: request as unknown as typeof fetch }, createElement(AgencyHome, {
    view, snapshot: snapshot(keepYourSite), busy: false, onWorkspace: vi.fn(), onOpenClientWork: vi.fn(), onOpenWork: vi.fn(), onStart: vi.fn(),
  }))));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  return { node, calls };
}

describe("agency Clients and Client websites", () => {
  it("mounts Client websites under the client list when keep your site could be on", async () => {
    const { node, calls } = await render(true, "clients");
    expect(node.textContent).toContain("Client websites");
    expect(calls.some(url => url.startsWith("/api/workspace/agency-client-sites?agencyWorkspaceId=" + AGENCY))).toBe(true);
  });
  it("shows nothing and asks for nothing when it is off", async () => {
    const { node, calls } = await render(false, "clients");
    expect(node.textContent).not.toContain("Client websites");
    expect(calls.some(url => url.startsWith("/api/workspace/agency-client-sites"))).toBe(false);
  });
  it("keeps it off the agency Home view", async () => {
    const { node, calls } = await render(true, "home");
    expect(node.textContent).not.toContain("Client websites");
    expect(calls.some(url => url.startsWith("/api/workspace/agency-client-sites"))).toBe(false);
  });
});
