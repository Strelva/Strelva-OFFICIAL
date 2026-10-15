// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AddedClient, AgencyAddClient } from "@/experience/workspace/agency/AgencyAddClient";
import type { AddAgencyClientResult, AgencyClientListItem } from "@/products/agency-clients/contracts";

const agency = "00000000-0000-4000-8000-000000000001";
const business = "00000000-0000-4000-8000-000000000002";
const delivery = { status: "not_sent", reason: "gated", decision: "R08", agencyEmailVerified: false } as const;
const client: AgencyClientListItem = {
  additionId: "00000000-0000-4000-8000-000000000003", agencyWorkspaceId: agency, customerWorkspaceId: business,
  name: "Northside Bakery", sourceKind: "url", sourceUrl: "https://example.com", prospectId: null,
  factsSeeded: 0, seatId: "00000000-0000-4000-8000-000000000004", addedBy: "00000000-0000-4000-8000-000000000005",
  addedAt: "2026-10-12T10:00:00.000Z", replayed: false, ownerClaimed: false, seatActive: true, pendingClaim: null,
};
const pending = { claimId: "00000000-0000-4000-8000-000000000006", recipientEmail: "owner@example.com", expiresAt: "2099-01-01T00:00:00.000Z", delivery };
const result: AddAgencyClientResult = {
  client, scan: { status: "not_requested", seeded: [], name: null, message: null }, ownerClaim: null, ownerClaimError: null,
  website: { connect: "/connect", rebuild: "/rebuild", rebuildOpenToAgency: true }, aiCheck: { status: "not_requested" },
};
let root: Root | undefined;
let container: HTMLDivElement;
async function mount(element: ReactNode = createElement(AgencyAddClient, { agencyWorkspaceId: agency, prospecting: false, initialProspectId: null })) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root!.render(element));
}
function button(name: string) { return [...container.querySelectorAll("button")].find(item => item.textContent?.trim() === name)!; }
async function click(name: string) { await act(async () => button(name).click()); }
async function ownerEmail() {
  const input = container.querySelector<HTMLInputElement>('input[type="email"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "owner@example.com");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function mountClaim(currentClient = client) {
  await mount(createElement(AddedClient, { result, agencyWorkspaceId: agency, agencyHref: "/agency", currentClient, onAnother: () => {}, onClaim: vi.fn() }));
  await ownerEmail();
}
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; container?.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("add-client recovery", () => {
  it("keeps Refresh and an explicit error after an initial list failure, then recovers empty", async () => {
    const request = vi.fn().mockResolvedValueOnce(Response.json({ error: "Clients unavailable" }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ clients: [] }));
    vi.stubGlobal("fetch", request); await mount();
    expect(container.textContent).toContain("Clients unavailable");
    expect(container.textContent).not.toContain("No clients added yet");
    expect(button("Refresh")).toBeDefined();
    await click("Refresh");
    expect(container.textContent).toContain("No clients added yet");
    expect(container.textContent).not.toContain("Clients unavailable");
    expect(button("Refresh")).toBeDefined();
  });

  it("retains visibly stale client rows and their claim when a later read fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ clients: [{ ...client, pendingClaim: pending }] }))
      .mockResolvedValueOnce(Response.json({ error: "Clients unavailable" }, { status: 503 })));
    await mount(); await click("Refresh");
    expect(container.textContent).toContain("Northside Bakery");
    expect(container.textContent).toContain("link for owner@example.com");
    expect(container.textContent).toContain("Last successful read");
    expect(container.textContent).toContain("Clients unavailable");
  });

  it("keeps Refresh present during a slow read without presenting an empty result", async () => {
    let resolve!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(done => { resolve = done; })));
    await mount();
    expect(container.textContent).toContain("Loading your agency’s clients");
    expect(button("Refresh").disabled).toBe(true);
    expect(container.textContent).not.toContain("No clients added yet");
    await act(async () => resolve(Response.json({ clients: [] })));
    expect(button("Refresh").disabled).toBe(false);
  });

  it.each([{}, { clients: [{ ...client, agencyWorkspaceId: business }] }])("rejects malformed or foreign client reads instead of presenting an empty result", async body => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
    await mount();
    expect(container.textContent).toContain("Your client list could not be confirmed");
    expect(container.textContent).not.toContain("No clients added yet");
    expect(button("Refresh")).toBeDefined();
  });

  it("holds an uncertain issuance until a claim read succeeds, then requires explicit replacement", async () => {
    let postCount = 0;
    let readable = true;
    let saved = client;
    const request = vi.fn(async (_input: unknown, init?: RequestInit) => {
      if (init?.method === "POST") { postCount++; saved = { ...client, pendingClaim: pending }; throw new TypeError("Lost response"); }
      return readable ? Response.json({ clients: [saved] }) : Response.json({ error: "Claims unavailable" }, { status: 503 });
    });
    vi.stubGlobal("fetch", request); await mountClaim(); await click("Create owner link");
    expect(postCount).toBe(1);
    expect(container.textContent).toContain("Outcome not confirmed");
    expect(button("Create owner link").disabled).toBe(true);
    readable = false; await click("Refresh owner claim");
    expect(button("Create owner link").disabled).toBe(true);
    expect(container.textContent).toContain("Claims unavailable");
    readable = true; await click("Refresh owner claim");
    expect(postCount).toBe(1);
    expect(container.textContent).toContain("owner@example.com");
    expect(button("Replace pending owner link").disabled).toBe(false);
    expect(container.querySelector<HTMLInputElement>('input[type="email"]')?.value).toBe("owner@example.com");
    await click("Replace pending owner link");
    expect(postCount).toBe(2);
    expect(request.mock.calls.filter(([, init]) => init?.method !== "POST").length).toBe(4);
  });

  it("reconciles a lost claim response that the owner has already accepted without another write", async () => {
    let saved = client;
    const request = vi.fn(async (_input: unknown, init?: RequestInit) => {
      if (init?.method === "POST") { saved = { ...client, ownerClaimed: true }; throw new TypeError("Lost response"); }
      return Response.json({ clients: [saved] });
    });
    vi.stubGlobal("fetch", request); await mountClaim(); await click("Create owner link"); await click("Refresh owner claim");
    expect(container.textContent).toContain("The owner has accepted their claim");
    expect(button("Create owner link")).toBeUndefined();
    expect(request.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it.each(["malformed", "foreign"] as const)("holds successful HTTP responses whose issued token cannot be confirmed (%s)", async state => {
    const request = vi.fn(async (_input: unknown, init?: RequestInit) => {
      if (init?.method !== "POST") return Response.json({ clients: [client] });
      return state === "malformed" ? new Response("truncated", { status: 200 }) : Response.json({ ownerClaim: {
        ...pending, customerWorkspaceId: agency, workspaceName: client.name, createdAt: client.addedAt,
        replacedPending: false, claimPath: "/workspace/claim/private-token",
      } });
    });
    vi.stubGlobal("fetch", request); await mountClaim(); await click("Create owner link");
    expect(container.textContent).toContain("Outcome not confirmed");
    expect(button("Create owner link").disabled).toBe(true);
    expect(button("Refresh owner claim")).toBeDefined();
  });

  it("delivers a confirmed current claim once, after its scoped read", async () => {
    const ownerClaim = { ...pending, customerWorkspaceId: business, workspaceName: client.name, createdAt: client.addedAt,
      replacedPending: false, claimPath: "/workspace/claim/private-token" };
    const onClaim = vi.fn();
    const request = vi.fn(async (_input: unknown, init?: RequestInit) => init?.method === "POST" ? Response.json({ ownerClaim }) : Response.json({ clients: [client] }));
    vi.stubGlobal("fetch", request);
    await mount(createElement(AddedClient, { result, agencyWorkspaceId: agency, agencyHref: "/agency", currentClient: client, onAnother: () => {}, onClaim }));
    await ownerEmail(); await click("Create owner link");
    expect(onClaim).toHaveBeenCalledExactlyOnceWith(ownerClaim);
    expect(request.mock.calls[0]?.[1]?.method).not.toBe("POST");
    expect(JSON.parse(String(request.mock.calls[1]?.[1]?.body))).toEqual({ action: "owner_link", agencyWorkspaceId: agency, customerWorkspaceId: business, ownerEmail: "owner@example.com" });
  });

  it("requires reconciliation when the initial add saved the client but could not confirm its owner claim", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ clients: [{ ...client, pendingClaim: pending }] })));
    await mount(createElement(AddedClient, { result: { ...result, ownerClaimError: "Owner claim response unavailable" }, agencyWorkspaceId: agency,
      agencyHref: "/agency", currentClient: client, onAnother: () => {}, onClaim: vi.fn() }));
    expect(button("Create owner link").disabled).toBe(true);
    await click("Refresh owner claim");
    expect(button("Replace pending owner link").disabled).toBe(false);
  });

  it.each(["claimed", "ended", "missing", "changed", "unavailable"] as const)("rechecks current authority/claims before issuance (%s)", async state => {
    const current = state === "claimed" ? { ...client, ownerClaimed: true } : state === "ended" ? { ...client, seatActive: false }
      : state === "changed" ? { ...client, pendingClaim: pending } : client;
    const request = vi.fn(async (_input: unknown, _init?: RequestInit) => state === "unavailable" ? Response.json({ error: "Claims unavailable" }, { status: 503 })
      : Response.json({ clients: state === "missing" ? [] : [current] }));
    vi.stubGlobal("fetch", request); await mountClaim(); await click("Create owner link");
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[1]?.method).not.toBe("POST");
    if (state === "claimed") expect(container.textContent).toContain("The owner has accepted their claim");
    if (state === "changed") expect(button("Replace pending owner link")).toBeDefined();
  });
});
