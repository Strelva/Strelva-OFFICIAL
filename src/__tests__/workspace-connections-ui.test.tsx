// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceConnections } from "@/experience/connections/WorkspaceConnections";
import { accountHolderLabel, connectionNextStep } from "@/experience/connections/model";
import { StrelvaSidebar } from "@/experience/app-frame/StrelvaSidebar";
import { readWorkspaceLocation, workspaceLocationHref } from "@/platform/workspaces/location";
import type { WorkspaceConnection } from "@/platform/connections/contracts";
const business = "11111111-1111-4111-8111-111111111111", agency = "22222222-2222-4222-8222-222222222222";
const row: WorkspaceConnection = { ref: "google_business_profile:1", provider: "google_business_profile", workspaceId: business, accountLabel: "Harbor Dental", accountHolder: { kind: "agency", workspaceId: agency }, accessThrough: { kind: "agency", workspaceId: agency }, state: "connected", unavailableReason: null, connectedAt: null, systemIds: [] };
let root: Root, node: HTMLDivElement;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); node = document.createElement("div"); document.body.append(node); root = createRoot(node); });
afterEach(async () => { await act(async () => root.unmount()); node.remove(); vi.unstubAllGlobals(); });
const render = async (request: typeof fetch, workspaceId = business, canRead = true) => act(async () => root.render(<WorkspaceConnections workspaceId={workspaceId} workspaceKind="customer" workspaceName="Harbor Dental" names={new Map([[agency, "North Studio"]])} request={request} canRead={canRead} canManage />));

describe("workspace Connections", () => {
  it("distinguishes account holder, agency access and legacy unknowns without inventing platform access", async () => {
    const request = vi.fn<typeof fetch>(async () => Response.json({ connections: [row, { ...row, ref: "calendly:old", provider: "calendly", accountHolder: { kind: "unknown" }, accessThrough: { kind: "unknown" }, state: "stale" }], sourceErrors: [] }));
    await render(request);
    expect(node.textContent).toContain("North Studio (your agency)");
    expect(node.textContent).toContain("Through North Studio’s Google access");
    expect(node.textContent).toContain("Unknown");
    expect(node.textContent).toContain("Reconnect to record whose account this is");
    expect(node.querySelector('a[href*="view=scheduling"]')?.textContent).toBe("Reconnect");
    expect(String(request.mock.calls[0]![0])).toContain(`workspaceId=${business}`);
    expect(request.mock.calls[0]![1]?.cache).toBe("no-store");
  });
  it("keeps readable rows and reports partial source failures; unavailable accounts have no connect control", async () => {
    await render(async () => Response.json({ connections: [{ ...row, state: "unavailable", unavailableReason: "area_not_granted" }], sourceErrors: ["stripe"] }));
    expect(node.textContent).toContain("Some accounts could not be read: Stripe");
    expect(node.textContent).toContain("Give your agency this business area in People & access.");
    expect(node.textContent).toContain("Coming soon");
    expect(node.querySelector('a[href*="/workspace/google"]')).toBeNull();
  });
  it("shows an honest empty state and refreshes with the current scope", async () => {
    const request = vi.fn<typeof fetch>(async () => Response.json({ connections: [], sourceErrors: [] }));
    await render(request);
    expect(node.textContent).toContain("No outside accounts are connected yet");
    expect(node.querySelector('a[href*="/workspace/google"]')?.textContent).toContain("Open setup");
    const refresh = [...node.querySelectorAll("button")].find(button => button.textContent === "Refresh Connections")!;
    await act(async () => refresh.click());
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("handles permission, malformed cross-workspace data and source transport failures", async () => {
    await render(async () => Response.json({ error: "denied" }, { status: 403 }));
    expect(node.textContent).toContain("Ask its owner for access");
    await render(async () => Response.json({ connections: [{ ...row, workspaceId: agency }], sourceErrors: [] }));
    expect(node.textContent).toContain("Connections could not be loaded");
    await render(async () => { throw new Error("offline"); });
    expect(node.textContent).toContain("Try again");
  });
  it("blocks delegated reads and hides previous workspace rows immediately on a scope change", async () => {
    const request = vi.fn<typeof fetch>(async () => Response.json({ connections: [row], sourceErrors: [] }));
    await render(request, business, false);
    expect(request).not.toHaveBeenCalled();
    await render(request);
    expect(node.textContent).toContain("Google Business Profile");
    const pending = vi.fn<typeof fetch>(() => new Promise(() => undefined));
    await render(pending, agency);
    expect(node.textContent).not.toContain("Google Business Profile");
    expect(node.querySelector('[aria-label="Loading Connections"]')).not.toBeNull();
  });
  it("shows platform accounts as Strelva without an Access line", async () => {
    await render(async () => Response.json({ connections: [{ ...row, provider: "resend", accountHolder: { kind: "platform" }, accessThrough: { kind: "platform" } }], sourceErrors: [] }));
    expect(node.textContent).toContain("Whose account: Strelva");
    expect(node.textContent).not.toContain("Access:");
    expect(accountHolderLabel({ kind: "business", workspaceId: business }, business, "customer", new Map())).toBe("Your business");
    expect(accountHolderLabel(row.accountHolder, agency, "agency", new Map([[agency, "North Studio"]]))).toBe("North Studio");
    expect(connectionNextStep({ ...row, unavailableReason: "coming_soon" })).toContain("coming soon");
  });
  it("exposes the section only when the workspace shell opts in and preserves route scope", async () => {
    await act(async () => root.render(<StrelvaSidebar accountName="You" signOut={null} />));
    expect(node.querySelector('a[href*="view=connections"]')).toBeNull();
    await act(async () => root.render(<StrelvaSidebar accountName="You" signOut={null} connectionsAvailable workspaceId={agency} active="connections" agencyNavigation={{ active: "home" }} />));
    expect(node.querySelector('a[href*="view=connections"]')?.textContent).toBe("Connections");
    expect(node.querySelector('a[href*="view=connections"]')?.getAttribute("aria-current")).toBe("page");
    const href = workspaceLocationHref("/workspace?view=system", { workspaceId: business, view: "connections" });
    expect(readWorkspaceLocation(new URL(href, "https://test.invalid").searchParams)).toEqual({ workspaceId: business, view: "connections" });
    expect(readWorkspaceLocation(new URLSearchParams(`workspaceId=${business}&view=connections&work=other`)).work).toBeUndefined();
  });
});
