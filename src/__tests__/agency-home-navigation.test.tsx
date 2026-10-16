// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkspaceApp } from "@/experience/workspace/WorkspaceApp";
import { createPreviewRequest } from "@/experience/workspace/preview/fixture";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined, prefetch: () => undefined }), usePathname: () => "/workspace", useSearchParams: () => new URLSearchParams() }));
const agency = "22222222-2222-4222-8222-222222222222";
const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  window.scrollTo = () => undefined;
  Element.prototype.scrollTo = () => undefined;
  window.history.replaceState(null, "", `/workspace?workspaceId=${agency}`);
});
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });

it("opens agency Home, preserves separate Clients navigation, and returns Home from its brand link", async () => {
  const base = createPreviewRequest("agency");
  const request = vi.fn<typeof fetch>(async (input, init) => {
    const path = new URL(String(input), "https://test.invalid").pathname;
    if (path === "/api/workspace/agency-clients") return Response.json({ agencyWorkspaceId: agency, clients: [], team: [], total: 0, nextCursor: null, providersRead: true, queueComplete: true, queueGaps: [], queue: [] });
    const response = await base(input, init);
    if (path !== "/api/workspace") return response;
    const data = await response.json();
    return Response.json({ ...data, releases: { ...data.releases, systems: true } });
  });
  const node = document.createElement("div"); document.body.appendChild(node);
  const root = createRoot(node); roots.push(root);
  await act(async () => root.render(<WorkspaceApp request={request} />));
  await settle();
  const mainNav = () => node.querySelector('aside nav[aria-label="Main"]')!;
  // October 15 (XA): Today in Main; the Clients page opens from "All clients" beside the clients list.
  const selected = () => node.querySelector('aside a[aria-current="page"]')?.textContent?.trim();
  expect(selected()).toBe("Today");
  const homeLink = [...mainNav().querySelectorAll<HTMLAnchorElement>("a")].find(link => link.textContent?.trim() === "Today")!;
  expect(new URL(homeLink.href).searchParams.has("agencyView")).toBe(false);
  const clients = [...node.querySelectorAll<HTMLAnchorElement>("aside a")].find(link => link.textContent?.trim() === "All clients")!;
  await act(async () => clients.click()); await settle();
  expect(selected()).toBe("All clients");
  expect(node.querySelector("h1")?.textContent).toBe("Clients");
  expect(new URLSearchParams(window.location.search).get("agencyView")).toBe("clients");
  // With the agency switcher in the header, Today is the way home.
  const brandHome = [...mainNav().querySelectorAll<HTMLAnchorElement>("a")].find(link => link.textContent?.trim() === "Today")!;
  await act(async () => brandHome.click()); await settle();
  expect(selected()).toBe("Today");
  expect(new URLSearchParams(window.location.search).has("agencyView")).toBe(false);
  expect(node.querySelector("h1")?.textContent).not.toBe("Clients");
  // Both views reuse the mounted agency's client read.
  expect(request.mock.calls.filter(([input]) => String(input).includes("/api/workspace/agency-clients"))).toHaveLength(1);
});

it("opens the agency Connections section in the workspace and preserves its scope", async () => {
  const base = createPreviewRequest("agency");
  const request = vi.fn<typeof fetch>(async (input, init) => {
    const path = new URL(String(input), "https://test.invalid").pathname;
    if (path === "/api/workspace/connections") return Response.json({ connections: [], sourceErrors: [] });
    if (path === "/api/workspace/agency-clients") return Response.json({ agencyWorkspaceId: agency, clients: [], team: [], total: 0, nextCursor: null, providersRead: true, queueComplete: true, queueGaps: [], queue: [] });
    const response = await base(input, init);
    if (path !== "/api/workspace") return response;
    const data = await response.json();
    return Response.json({ ...data, releases: { ...data.releases, systems: true } });
  });
  const node = document.createElement("div"); document.body.appendChild(node);
  const root = createRoot(node); roots.push(root);
  await act(async () => root.render(<WorkspaceApp request={request} />)); await settle();
  // XA keeps Connections in the agency details sidebar, opened from the account row.
  const details = node.querySelector<HTMLAnchorElement>('aside a[aria-label="Agency details"]')!;
  await act(async () => details.click()); await settle();
  const connections = node.querySelector<HTMLAnchorElement>('aside a[href*="view=connections"]')!;
  expect(connections).not.toBeNull();
  await act(async () => connections.click()); await settle();
  expect(node.querySelector("h1")?.textContent).toBe("Connections");
  expect(node.textContent).toContain("No outside accounts are connected yet");
  expect(new URLSearchParams(window.location.search).get("view")).toBe("connections");
  expect(request.mock.calls.find(([input]) => String(input).includes("/api/workspace/connections"))?.[0]).toContain(`workspaceId=${agency}`);
});
