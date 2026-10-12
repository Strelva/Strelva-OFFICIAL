// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgencyAddClient } from "@/experience/workspace/agency/AgencyAddClient";
import type { AddAgencyClientInput, AddAgencyClientResult } from "@/products/agency-clients/contracts";

const agency = "00000000-0000-4000-8000-000000000001";
const business = "00000000-0000-4000-8000-000000000002";
const actor = "00000000-0000-4000-8000-000000000003";
const key = "00000000-0000-4000-8000-000000000004";
const lead = { token: "a".repeat(36), businessName: "Northside Bakery", email: "owner@bakery.example", currentWebsite: null };
const saved: AddAgencyClientInput = { action: "add", agencyWorkspaceId: agency, idempotencyKey: key, leadToken: lead.token, name: "Reviewed bakery", ownerEmail: "reviewed@example.test" };
const receipt: AddAgencyClientResult = { client: {
  additionId: "00000000-0000-4000-8000-000000000005", agencyWorkspaceId: agency, customerWorkspaceId: business,
  name: "Northside Bakery", sourceKind: "url", sourceUrl: null, prospectId: null, factsSeeded: 1, seatId: null,
  addedBy: actor, addedAt: "2026-10-12T10:00:00.000Z", replayed: false,
}, scan: { status: "not_requested", seeded: [], name: null, message: null }, ownerClaim: null, ownerClaimError: null,
website: { connect: "/connect", rebuild: "/rebuild", rebuildOpenToAgency: true }, aiCheck: { status: "not_requested" }, leadConversion: { status: "converted" } };

let root: Root | undefined;
let container: HTMLDivElement;
async function mount(extra: Partial<Parameters<typeof AgencyAddClient>[0]> = {}) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root!.render(createElement(AgencyAddClient, { agencyWorkspaceId: agency, prospecting: false, initialProspectId: null, initialLead: lead, ...extra })));
}
function button(name: string) { return [...container.querySelectorAll("button")].find(item => item.textContent?.trim() === name)!; }
async function click(name: string) { await act(async () => button(name).click()); }
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; container?.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("lead conversion recovery in the ordinary add-client flow", () => {
  it("adds a lead without a website using its business name, without another-add or email claims", async () => {
    const request = vi.fn(async (_url: unknown, init?: RequestInit) => init?.method === "POST" ? Response.json(receipt) : Response.json({ clients: [] }));
    vi.stubGlobal("fetch", request); await mount();
    expect(container.querySelector<HTMLInputElement>('input[type="url"]')?.required).toBe(false);
    expect(container.querySelector<HTMLInputElement>('input[type="email"]')?.value).toBe(lead.email);
    await click("Add client");
    const body = JSON.parse(String(request.mock.calls.find(([, init]) => init?.method === "POST")?.[1]?.body));
    expect(body).toMatchObject({ name: lead.businessName, ownerEmail: lead.email, leadToken: lead.token });
    expect(body).not.toHaveProperty("url");
    expect(container.textContent).toContain("Lead converted. The client business was created.");
    expect(button("Add another client")).toBeUndefined();
  });

  it("holds the original details and key after a lost response, then confirms the exact same addition", async () => {
    const bodies: string[] = [];
    const request = vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (init?.method !== "POST") return Response.json({ clients: [] });
      bodies.push(String(init.body)); if (bodies.length === 1) throw new TypeError("Lost response");
      return Response.json({ ...receipt, client: { ...receipt.client, replayed: true } });
    });
    vi.stubGlobal("fetch", request); await mount(); await click("Add client");
    expect(container.textContent).toContain("Outcome not confirmed");
    expect(container.querySelector("fieldset")?.disabled).toBe(true);
    await click("Confirm client addition");
    expect(bodies).toHaveLength(2); expect(bodies[0]).toBe(bodies[1]);
    expect(container.textContent).toContain("this client was already added");
    expect(container.textContent).toContain("Lead converted");
  });

  it("keeps fields editable after a deterministic first-attempt URL refusal made before the lead lock", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init?: RequestInit) => init?.method === "POST"
      ? Response.json({ error: "Enter a public website address.", code: "agency_client_invalid" }, { status: 400 }) : Response.json({ clients: [] })));
    await mount({ initialLead: { ...lead, currentWebsite: "https://bakery.example:8080" } }); await click("Add client");
    expect(container.textContent).toContain("Enter a public website address.");
    expect(container.querySelector("fieldset")?.disabled).toBe(false);
    expect(button("Add client")).toBeDefined(); expect(button("Confirm client addition")).toBeUndefined();
  });

  it.each(["malformed", "foreign", "missing_conversion"])("does not claim success from an unconfirmed response (%s)", async state => {
    const response = state === "malformed" ? { client: {} } : state === "foreign"
      ? { ...receipt, client: { ...receipt.client, agencyWorkspaceId: business } } : { ...receipt, leadConversion: undefined };
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init?: RequestInit) => init?.method === "POST" ? Response.json(response) : Response.json({ clients: [] })));
    await mount(); await click("Add client");
    expect(container.textContent).toContain("Outcome not confirmed");
    expect(container.textContent).not.toContain("Client added");
    expect(button("Confirm client addition")).toBeDefined();
  });

  it("retains business success when the lead write is unconfirmed, then retries only the same addition", async () => {
    const bodies: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (init?.method !== "POST") return Response.json({ clients: [] });
      bodies.push(String(init.body));
      return Response.json(bodies.length === 1 ? { ...receipt, leadConversion: { status: "unconfirmed", message: "Client retained; lead write unconfirmed." } } : receipt);
    }));
    await mount(); await click("Add client");
    expect(container.textContent).toContain("Client added"); expect(container.textContent).toContain("Client retained; lead write unconfirmed.");
    expect(button("Add another client")).toBeUndefined(); await click("Confirm lead conversion");
    expect(bodies[0]).toBe(bodies[1]); expect(container.textContent).toContain("Lead converted");
  });

  it("resumes the stored submitted body after a reload rather than rebuilding from the lead", async () => {
    const request = vi.fn(async (_url: unknown, init?: RequestInit) => init?.method === "POST" ? Response.json(receipt) : Response.json({ clients: [] }));
    vi.stubGlobal("fetch", request); await mount({ initialConversion: saved });
    expect(container.querySelector<HTMLInputElement>('input[type="email"]')?.value).toBe(saved.ownerEmail);
    expect(container.querySelector("fieldset")?.disabled).toBe(true); await click("Confirm client addition");
    expect(JSON.parse(String(request.mock.calls.find(([, init]) => init?.method === "POST")?.[1]?.body))).toEqual(saved);
  });

  it("keeps deliberately omitted website and owner email empty when resuming a stored request", async () => {
    const { ownerEmail: _email, ...withoutEmail } = saved;
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ clients: [] })));
    await mount({ initialConversion: withoutEmail, initialLead: { ...lead, currentWebsite: "https://bakery.example" } });
    expect(container.querySelector<HTMLInputElement>('input[type="email"]')?.value).toBe("");
    expect(container.querySelector<HTMLInputElement>('input[type="url"]')?.value).toBe("");
  });

  it("offers no add when another person owns the held conversion", async () => {
    const request = vi.fn(async () => Response.json({ clients: [] }));
    vi.stubGlobal("fetch", request); await mount({ conversionHeld: true });
    expect(container.textContent).toContain("person who started this conversion must confirm");
    expect(container.querySelector("form")).toBeNull();
    expect(request.mock.calls).toHaveLength(1);
  });
});
