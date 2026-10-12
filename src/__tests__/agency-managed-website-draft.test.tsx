// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgencyManagedWebsiteDraftExperience } from "@/experience/agency-website/AgencyManagedWebsiteDraftExperience";
import { AgencyWebsiteCustomerControls } from "@/experience/agency-website/AgencyWebsiteCustomerControls";

const bindingId = "a3021200-0000-4000-8000-000000000020";
const deliveryId = "a3021200-0000-4000-8000-000000000031";
const assignmentId = "a3021200-0000-4000-8000-000000000032";
const grantId = "a3021200-0000-4000-8000-000000000033";
const operatorId = "a3021200-0000-4000-8000-000000000002";
const ownerId = "a3021200-0000-4000-8000-000000000001";
const expiresAt = "2026-09-27T12:00:00.000Z";
const hash = "a".repeat(32);
const otherBindingId = "a3021200-0000-4000-8000-000000000021";

const grant = {
  id: grantId,
  managedWebsiteBindingId: bindingId,
  businessWorkspaceId: "a3021200-0000-4000-8000-000000000010",
  tenantId: "website-draft-a",
  deliveryId,
  assignmentId,
  agencyWorkspaceId: "a3021200-0000-4000-8000-000000000011",
  operatorUserId: operatorId,
  grantedBy: ownerId,
  status: "active",
  expiresAt,
  createdAt: "2026-09-20T12:00:00.000Z",
  updatedAt: "2026-09-20T12:00:00.000Z",
  revokedAt: null,
  revokedBy: null,
};

const context = { bindingId, deliveryId, businessWorkspaceId: grant.businessWorkspaceId, businessName: "Harbor Dental", agencyWorkspaceId: grant.agencyWorkspaceId, agencyName: "North Studio", operatorUserId: grant.operatorUserId, personName: "maya@example.test", websiteName: "harbordental.example", expiresAt };

const state = {
  tenantId: "website-draft-a",
  section: "hero",
  revision: 0,
  data: {
    headline: "Current headline",
    subheadline: "Current subheadline",
    tagline: "Current tagline",
    ctaText: "Learn more",
    ctaLink: "/about",
    backgroundImageUrl: "",
  },
  dataHash: hash,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function render(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  await act(async () => Promise.resolve());
  return { container, root };
}

function changeInput(field: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

// The fixture grant expires on a fixed date. Pin the clock inside its validity
// window so "active" and "expired" cases don't depend on when the suite runs.
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-21T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("managed website agency draft authority", () => {
  it("grants the named operator one exact draft preparation, then runs without changing accepted input", async () => {
    const requests: Array<{ url: string; body?: Record<string, unknown> }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined;
      requests.push({ url, body });
      if (url.startsWith("/api/operational-assignments")) {
        return jsonResponse({ responsibility: { payload: { steps: [{ result: { websiteDraft: { revision: 1, publication: "customer_only" } } }] } } });
      }
      if (body?.action === "prepare") return jsonResponse({ preparation: { id: "a3021200-0000-4000-8000-000000000034" } }, 201);
      return jsonResponse({ grant, state, customerWebsiteHref: "/client/website-draft-a/dashboard/site" });
    });

    const { container, root } = await render(createElement(AgencyManagedWebsiteDraftExperience, { bindingId, section: "hero" }));
    expect(container.textContent).toContain("Prepare a website update");
    const headline = container.querySelector<HTMLInputElement>("#managed-website-hero-headline");
    expect(headline).toBeTruthy();
    const nextData = { ...state.data, headline: "Prepared by the named operator" };
    changeInput(headline!, nextData.headline);
    const save = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Prepare and save draft"));
    expect(save).toBeTruthy();
    await act(async () => save?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(requests[1]?.body).toMatchObject({
      action: "prepare", assignmentId, bindingId, section: "hero", data: nextData, expectedRevision: 0, expectedHash: hash,
    });
    expect(requests[2]?.body).toEqual({ action: "run", assignmentId });
    expect(requests[2]?.body).not.toHaveProperty("input");
    expect(container.textContent).toContain("Saved hero draft Release 1");
    expect(container.textContent).toContain("The client reviews and publishes your draft");
    expect(container.querySelector<HTMLAnchorElement>('a[href="/client/website-draft-a/dashboard/site"]')).toBeTruthy();
    act(() => root.unmount());
    container.remove();
  });

  it("withholds preparation controls when the client grant is revoked or expired", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      grant: { ...grant, status: "revoked", revokedAt: "2026-09-20T13:00:00.000Z", revokedBy: ownerId },
      state,
    }));
    const { container, root } = await render(createElement(AgencyManagedWebsiteDraftExperience, { bindingId }));
    expect(container.textContent).toContain("revoked or expired");
    expect(container.textContent).not.toContain("Prepare and save draft");
    act(() => root.unmount());
    container.remove();
  });

  it("lets the client grant and revoke the named operator through the access controls", async () => {
    const requests: Array<Record<string, unknown>> = [];
    let granted = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      if (String(_input).includes("context=1")) return jsonResponse({ context });
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined;
      if (body) requests.push(body);
      if (body?.action === "grant") {
        granted = true;
        return jsonResponse({ grant }, 201);
      }
      if (body?.action === "revoke") return jsonResponse({ grant: { ...grant, status: "revoked", revokedAt: "2026-09-20T13:00:00.000Z", revokedBy: ownerId } });
      return jsonResponse({ grant: granted ? grant : null });
    });
    const { container, root } = await render(createElement(AgencyWebsiteCustomerControls, { deliveryId, bindingId }));
    const grantButton = [...container.querySelectorAll("button")].find((button) => button.textContent === "Allow North Studio to prepare drafts");
    expect(grantButton).toBeTruthy();
    await act(async () => grantButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(requests[0]).toEqual({ action: "grant", deliveryId, bindingId, agencyWorkspaceId: context.agencyWorkspaceId, operatorUserId: context.operatorUserId });
    const revokeButton = [...container.querySelectorAll("button")].find((button) => button.textContent === "Remove draft access");
    expect(revokeButton).toBeTruthy();
    await act(async () => revokeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(requests[1]).toEqual({ action: "revoke", grantId });
    expect(container.textContent).toContain("revoked");
    act(() => root.unmount());
    container.remove();
  });

  it("holds new grants when agency identity fails, while keeping revocation available", async () => {
    const requests: unknown[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).includes("context=1")) return jsonResponse({ error: "Unavailable" }, 503);
      if (init?.method === "POST") { requests.push(JSON.parse(String(init.body))); return jsonResponse({ grant: { ...grant, status: "revoked" } }); }
      return jsonResponse({ grant });
    });
    const { container, root } = await render(createElement(AgencyWebsiteCustomerControls, { deliveryId, bindingId }));
    expect(container.textContent).toContain("No new access can be granted");
    expect([...container.querySelectorAll("button")].some(button => button.textContent?.startsWith("Allow "))).toBe(false);
    await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Remove draft access")!.click());
    expect(requests).toEqual([{ action: "revoke", grantId }]);
    act(() => root.unmount()); container.remove();
  });

  it("refuses a grant receipt for another assigned person", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).includes("context=1")) return jsonResponse({ context });
      return jsonResponse({ grant: init?.method === "POST" ? { ...grant, operatorUserId: ownerId } : null });
    });
    const { container, root } = await render(createElement(AgencyWebsiteCustomerControls, { deliveryId, bindingId }));
    await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Allow North Studio to prepare drafts")!.click());
    expect(container.textContent).toContain("receipt could not be confirmed");
    expect(container.textContent).not.toContain("Draft preparation is enabled");
    act(() => root.unmount()); container.remove();
  });

  it("does not present an expired client grant as active and allows a fresh grant", async () => {
    const requests: Array<Record<string, unknown>> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      if (String(_input).includes("context=1")) return jsonResponse({ context });
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined;
      if (body) requests.push(body);
      if (body?.action === "grant") return jsonResponse({ grant: { ...grant, expiresAt } }, 201);
      return jsonResponse({ grant: { ...grant, expiresAt: "2026-09-19T12:00:00.000Z" } });
    });
    const { container, root } = await render(createElement(AgencyWebsiteCustomerControls, { deliveryId, bindingId }));
    expect(container.textContent).toContain("revoked or expired");
    const grantButton = [...container.querySelectorAll("button")].find((button) => button.textContent === "Allow North Studio to prepare drafts");
    expect(grantButton).toBeTruthy();
    await act(async () => grantButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(requests[0]).toEqual({ action: "grant", deliveryId, bindingId, agencyWorkspaceId: context.agencyWorkspaceId, operatorUserId: context.operatorUserId });
    expect(container.textContent).toContain("Draft preparation is enabled");
    act(() => root.unmount());
    container.remove();
  });

  it("does not let a late permission response replace the current delivery", async () => {
    let resolveFirst!: (response: Response) => void;
    let resolveSecond!: (response: Response) => void;
    const first = new Promise<Response>((resolve) => { resolveFirst = resolve; });
    const second = new Promise<Response>((resolve) => { resolveSecond = resolve; });
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => String(input).includes("context=1") ? Promise.resolve(jsonResponse({ context: { ...context, bindingId: String(input).includes(otherBindingId) ? otherBindingId : bindingId } })) : String(input).includes(otherBindingId) ? second : first);
    const { container, root } = await render(createElement(AgencyWebsiteCustomerControls, { deliveryId, bindingId }));
    await act(async () => root.render(createElement(AgencyWebsiteCustomerControls, { deliveryId, bindingId: otherBindingId })));
    resolveSecond(jsonResponse({ grant: { ...grant, managedWebsiteBindingId: otherBindingId } }));
    await act(async () => { await second; });
    resolveFirst(jsonResponse({ grant: null }));
    await act(async () => { await first; });
    expect(container.textContent).toContain("Draft preparation is enabled");
    expect([...container.querySelectorAll("button")].some(button => button.textContent === "Allow North Studio to prepare drafts")).toBe(false);
    act(() => root.unmount());
    container.remove();
  });
});
