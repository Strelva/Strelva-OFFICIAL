// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SystemPage } from "@/experience/systems/SystemPage";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
import type { SystemView } from "@/experience/systems/model";
import { builtInApp, builtInAppReleaseLabel } from "@/platform/app-releases/catalog";

const WS = "a0000000-0000-4000-8000-000000000001";
const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); Element.prototype.scrollTo = () => undefined; });
afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});
async function render(element: React.ReactNode) {
  const node = document.createElement("div"); document.body.append(node);
  const root = createRoot(node); roots.push(root);
  await act(async () => root.render(element));
  return node;
}

const bookings = builtInApp("bookings");
const system = (withApp: boolean): SystemView => ({
  id: "51000000-0000-4000-8000-000000000011", kind: "bookings", name: "Consult booking", detail: "", lifecycle: "live", health: { state: "unknown", summary: "No checks yet." },
  surface: { kind: "newsletter", audience: "Everyone" }, connections: [], possibilities: [], versions: [],
  ...(withApp ? { builtInApp: { appId: "bookings" as const, name: "Bookings", release: 1, latest: 1, label: builtInAppReleaseLabel(bookings, 1), requiredConnections: [...bookings.releases[0]!.requiredConnections] } } : {}),
});
const page = (value: SystemView, request: typeof fetch) => <WorkspaceRequestContext.Provider value={request}>
  <SystemPage system={value} systems={[value]} workspaceId={WS} readOnly={false} sources={[]} systemHref={id => `/systems/${id}`} onHome={() => undefined} onAsk={() => undefined} />
</WorkspaceRequestContext.Provider>;

describe("Needs on a built-in App System page", () => {
  it("lists each declared Connection and says customer email is off", async () => {
    const request = vi.fn<typeof fetch>(async () => Response.json({
      sourceErrors: [],
      connections: [{ ref: "resend:platform", provider: "resend", workspaceId: WS, accountLabel: "Business customer email is off", accountHolder: { kind: "platform" }, accessThrough: { kind: "platform" }, state: "disconnected", unavailableReason: null, connectedAt: null, systemIds: [] }],
    }));
    const node = await render(page(system(true), request));
    const needs = node.querySelector('[aria-label="Connections this App needs"]')!;
    expect(needs.textContent).toContain("Google Calendar · optional");
    expect(needs.textContent).toContain("Email sending · optional");
    expect(needs.textContent).toContain("Business customer email is off");
    expect(node.textContent).toContain("Required accounts are checked again when you make it live.");
    expect(node.textContent).not.toContain("Installs as Draft");
    expect(request.mock.calls.every(([, init]) => init?.method === undefined)).toBe(true);
  });

  it("shows the permission copy on a 403", async () => {
    const request = vi.fn<typeof fetch>(async () => Response.json({ error: "no" }, { status: 403 }));
    const node = await render(page(system(true), request));
    expect(node.textContent).toContain("You do not have permission to read this business’s Connections");
  });

  it("reads no Connections for a System without a built-in App", async () => {
    const request = vi.fn<typeof fetch>(async () => Response.json({ connections: [], sourceErrors: [] }));
    const node = await render(page(system(false), request));
    expect(request.mock.calls.filter(([url]) => String(url).includes("/api/workspace/connections"))).toHaveLength(0);
    expect(node.querySelector('[aria-label="Connections this App needs"]')).toBeNull();
  });
});
