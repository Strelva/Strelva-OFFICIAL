// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceConnections } from "@/experience/connections/WorkspaceConnections";
import { accountHolderLabel, connectionNextStep } from "@/experience/connections/model";
import { StrelvaSidebar } from "@/experience/app-frame/StrelvaSidebar";
import { readWorkspaceLocation, workspaceLocationHref } from "@/platform/workspaces/location";
import type { WorkspaceConnection } from "@/platform/connections/contracts";
import { CONNECTION_PROVIDERS } from "@/platform/connections/contracts";
import { providerDefinition } from "@/platform/connections/providers";
const business = "11111111-1111-4111-8111-111111111111", agency = "22222222-2222-4222-8222-222222222222";
const row: WorkspaceConnection = { ref: "google_business_profile:1", provider: "google_business_profile", workspaceId: business, accountLabel: "Harbor Dental", accountHolder: { kind: "agency", workspaceId: agency }, accessThrough: { kind: "agency", workspaceId: agency }, state: "connected", unavailableReason: null, connectedAt: null, systemIds: [] };
let root: Root, node: HTMLDivElement;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); node = document.createElement("div"); document.body.append(node); root = createRoot(node); });
afterEach(async () => { await act(async () => root.unmount()); node.remove(); vi.unstubAllGlobals(); });
const render = async (request: typeof fetch, workspaceId = business, canRead = true) => act(async () => root.render(<WorkspaceConnections workspaceId={workspaceId} workspaceKind="customer" workspaceName="Harbor Dental" names={new Map([[agency, "North Studio"]])} request={request} canRead={canRead} canManage />));

describe("workspace Connections", () => {
  it("lists rows from every provider while naming their recorded account holder", async () => {
    await render(async () => Response.json({ connections: CONNECTION_PROVIDERS.map(provider => ({ ...row, provider, ref: `${provider}:fixture`, accountHolder: { kind: "business", workspaceId: business }, accessThrough: { kind: "platform" } })), sourceErrors: [] }));
    for (const provider of CONNECTION_PROVIDERS) expect(node.textContent).toContain(providerDefinition(provider).label);
    expect(node.textContent?.match(/Whose account: Your business/g)).toHaveLength(9);
  });
  it("shows Coming soon for unavailable providers before there are any account rows", async () => {
    await render(async () => Response.json({ connections: [], sourceErrors: [], providerEligibility: {
      google_business_profile: { eligible: false, reason: "coming_soon", message: "Google Business Profile for businesses on Strelva is coming soon." },
    } }));
    expect(node.textContent).toContain("Google Business Profile for businesses on Strelva is coming soon.");
    expect(node.querySelector('a[href*="/workspace/google"]')).toBeNull();
    expect(node.querySelector('a[href*="view=scheduling"]')).not.toBeNull();
  });
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
    expect(node.textContent).toContain("Needs access");
    expect(node.querySelector('a[href*="/workspace/google"]')).toBeNull();
  });
  it("says Not set up yet, Waiting on Google and Coming soon for the three honest reasons", async () => {
    await render(async () => Response.json({ connections: [{ ...row, state: "unavailable", unavailableReason: "approval_pending" }], sourceErrors: [], providerEligibility: {
      highlevel: { eligible: false, reason: "not_set_up", message: "HighLevel isn't set up on Strelva yet." },
      stripe: { eligible: false, reason: "not_configured", message: "Stripe is coming soon." },
    } }));
    expect(node.textContent).toContain("Waiting on Google");
    expect(node.textContent).toContain("Google Business Profile is waiting on Google’s approval.");
    expect(node.textContent).toContain("Coming soon");
  });
  it("shows Not set up yet and the next step for a provider missing its keys", async () => {
    root.unmount(); root = createRoot(node);
    await act(async () => root.render(<WorkspaceConnections workspaceId={agency} workspaceKind="agency" workspaceName="North Studio" names={new Map()} canRead canManage request={async () => Response.json({ connections: [], sourceErrors: [], providerEligibility: {
      highlevel: { eligible: false, reason: "not_set_up", message: "HighLevel isn't set up on Strelva yet." },
    } })} />));
    expect(node.textContent).toContain("Not set up yet");
    expect(node.textContent).toContain("HighLevel isn't set up on Strelva yet.");
  });
  it("shows an honest empty state and refreshes with the current scope", async () => {
    const request = vi.fn<typeof fetch>(async () => Response.json({ connections: [], sourceErrors: [] }));
    await render(request);
    expect(node.textContent).toContain("No outside accounts are connected yet");
    expect(node.querySelector('a[href*="/workspace/google"]')?.textContent).toContain("Open setup");
    const refresh = [...node.querySelectorAll("button")].find(button => button.textContent === "Refresh")!;
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
    expect(connectionNextStep({ ...row, provider: "highlevel", unavailableReason: "not_set_up" })).toContain("nothing to do on your side");
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
