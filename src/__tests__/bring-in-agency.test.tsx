// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BringInAgency } from "@/experience/workspace/BringInAgency";
import { agencyConsentText } from "@/platform/agency-directory/contract";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const STRELVA_AGENCY = "22222222-2222-4222-8222-222222222222";
const NORTH = "33333333-3333-4333-8333-333333333333";
let root: Root | undefined;
let container: HTMLDivElement;
afterEach(async () => { await act(async () => root?.unmount()); container?.remove(); vi.unstubAllGlobals(); });

async function mount(transport: (input: string, init?: RequestInit) => Promise<Response>, canManage = true) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => { root!.render(createElement(BringInAgency, { workspaceId: WORKSPACE, canManage, transport })); });
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const buttons = () => [...container.querySelectorAll("button")];
const byText = (text: string) => buttons().find(button => button.textContent?.includes(text));

describe("Bring in an agency (ADR 0015)", () => {
  it("lists agencies with no default, sends the owner's scopes and consent, and waits for the agency", async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    const transport = vi.fn(async (input: string, init?: RequestInit) => {
      calls.push({ input, init });
      if (!init?.method) return json({ directory: [{ agencyWorkspaceId: STRELVA_AGENCY, name: "Strelva Agency", summary: "Managed websites, done for you." }], agencies: [] });
      return json({ agencies: [{ agencyWorkspaceId: STRELVA_AGENCY, name: "Strelva Agency", seat: false, ofRecord: false, scopes: [{ scope: "website", level: "full_control", status: "proposed" }] }] });
    });
    await mount(transport);
    expect(container.textContent).toContain("Want it done for you? Bring in an agency.");
    expect(container.textContent).toContain("Strelva Agency");
    // Nothing is chosen for the owner.
    expect(container.textContent).not.toContain("Send to");
    await act(async () => byText("Strelva Agency")!.click());
    const website = container.querySelector('[aria-label="Website for Strelva Agency"]')!;
    await act(async () => [...website.querySelectorAll("button")].find(button => button.textContent === "Full control")!.click());
    expect(container.textContent).toContain(agencyConsentText("Strelva Agency", [{ scope: "website", level: "full_control" }]));
    await act(async () => byText("Send to Strelva Agency")!.click());
    const sent = calls.find(call => call.init?.method === "POST")!;
    expect(JSON.parse(String(sent.init!.body))).toEqual({ workspaceId: WORKSPACE, agencyWorkspaceId: STRELVA_AGENCY, scopes: [{ scope: "website", level: "full_control" }] });
    expect(container.textContent).toContain("Nothing changes until they accept");
    expect(container.textContent).toContain("Waiting for them to accept");
  });

  it("keeps full control off where another agency holds it", async () => {
    await mount(async () => json({
      directory: [{ agencyWorkspaceId: STRELVA_AGENCY, name: "Strelva Agency", summary: "Managed websites." }],
      agencies: [{ agencyWorkspaceId: NORTH, name: "North Studio", seat: true, ofRecord: true, scopes: [{ scope: "website", level: "full_control", status: "active" }] }],
    }));
    expect(container.textContent).toContain("Website · Full control");
    await act(async () => byText("Strelva Agency")!.click());
    const website = container.querySelector('[aria-label="Website for Strelva Agency"]')!;
    expect([...website.querySelectorAll("button")].find(button => button.textContent === "Full control")!.disabled).toBe(true);
    const bookings = container.querySelector('[aria-label="Bookings for Strelva Agency"]')!;
    expect([...bookings.querySelectorAll("button")].find(button => button.textContent === "Full control")!.disabled).toBe(false);
  });

  it("lets only an owner bring in or end agencies, and reports a failed load honestly", async () => {
    await mount(async () => json({ directory: [], agencies: [{ agencyWorkspaceId: NORTH, name: "North Studio", seat: true, ofRecord: true, scopes: [] }] }), false);
    expect(container.textContent).toContain("Only an owner can bring in or end an agency.");
    expect(byText("End access")).toBeUndefined();
    await act(async () => root!.unmount()); container.remove();
    await mount(async () => json({ error: "Agencies couldn't be loaded. Nothing changed." }, 503));
    expect(container.textContent).toContain("Agencies couldn't be loaded. Nothing changed.");
    expect(byText("Try again")).toBeDefined();
  });
});
