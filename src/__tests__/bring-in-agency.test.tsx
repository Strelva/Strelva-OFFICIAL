// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BringInAgency } from "@/experience/workspace/BringInAgency";
import { agencyConsentText, type AgencyScope } from "@/platform/agency-directory/contract";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const STRELVA_AGENCY = "22222222-2222-4222-8222-222222222222";
const NORTH = "33333333-3333-4333-8333-333333333333";
let root: Root | undefined;
let container: HTMLDivElement;
afterEach(async () => { await act(async () => root?.unmount()); container?.remove(); vi.unstubAllGlobals(); });

async function mount(transport: (input: string, init?: RequestInit) => Promise<Response>, canManage = true, initialScope?: AgencyScope) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => { root!.render(createElement(BringInAgency, { workspaceId: WORKSPACE, canManage, transport, initialScope })); });
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const buttons = () => [...container.querySelectorAll("button")];
const byText = (text: string) => buttons().find(button => button.textContent?.includes(text));

describe("Bring in an agency (ADR 0015)", () => {
  it("carries website intent without selecting an agency or sending a proposal before consent", async () => {
    const writes = vi.fn();
    await mount(async (_input, init) => {
      if (init?.method) writes(init);
      return json({ directory: [{ agencyWorkspaceId: NORTH, name: "North Studio", summary: "Websites" }], agencies: [] });
    }, true, "website");
    expect(byText("Send to North Studio")).toBeUndefined();
    expect(writes).not.toHaveBeenCalled();
    await act(async () => byText("North Studio")!.click());
    const website = container.querySelector('[aria-label="Website for North Studio"]')!;
    expect([...website.querySelectorAll("button")].find(button => button.textContent === "Prepare")!.getAttribute("aria-checked")).toBe("true");
    expect(container.textContent).toContain(agencyConsentText("North Studio", [{ scope: "website", level: "prepare" }]));
    expect(writes).not.toHaveBeenCalled();
  });

  it("fails closed on malformed agency access instead of offering choices", async () => {
    await mount(async () => json({ directory: [{ agencyWorkspaceId: NORTH, name: "North Studio", summary: "Websites" }], agencies: [{ agencyWorkspaceId: NORTH, name: "North Studio", scopes: [] }] }));
    expect(container.textContent).toContain("Agencies couldn't be loaded");
    expect(byText("North Studio")).toBeUndefined();
  });

  it("discards choices and aborts a pending old-business read when the workspace changes", async () => {
    let oldSignal: AbortSignal | null | undefined;
    let finishOld: (response: Response) => void = () => undefined;
    await mount(async (_input, init) => {
      oldSignal = init?.signal;
      return new Promise<Response>(resolve => { finishOld = resolve; });
    });
    await act(async () => root!.render(createElement(BringInAgency, { workspaceId: NORTH, canManage: true, transport: async () => json({ directory: [], agencies: [] }) })));
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => finishOld(json({ directory: [{ agencyWorkspaceId: STRELVA_AGENCY, name: "Old business agency", summary: "Websites" }], agencies: [] })));
    expect(container.textContent).not.toContain("Old business agency");
    expect(container.textContent).toContain("No other agencies are listed yet.");
  });

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

  it("changes an existing unlisted agency's complete access through acceptance, without granting it immediately", async () => {
    const scopes = [{ scope: "website", level: "full_control", status: "active" }, { scope: "google", level: "prepare", status: "active" }];
    const writes: unknown[] = [];
    await mount(async (_input, init) => {
      if (init?.method === "POST") {
        writes.push(JSON.parse(String(init.body)));
        return json({ agencies: [{ agencyWorkspaceId: NORTH, name: "North Studio", seat: true, ofRecord: true, scopes: [...scopes,
          { scope: "website", level: "prepare", status: "proposed" }, { scope: "bookings", level: "full_control", status: "proposed" }] }] });
      }
      return json({ directory: [], agencies: [{ agencyWorkspaceId: NORTH, name: "North Studio", seat: true, ofRecord: true, scopes }] });
    });
    await act(async () => byText("Change access")!.click());
    const area = (name: string) => container.querySelector(`[aria-label="${name} for North Studio"]`)!;
    const option = (name: string, level: string) => [...area(name).querySelectorAll("button")].find(button => button.textContent === level)!;
    expect(option("Website", "Full control").getAttribute("aria-checked")).toBe("true");
    expect(option("Website", "Full control").disabled).toBe(false);
    expect(option("Google", "Prepare").getAttribute("aria-checked")).toBe("true");
    expect(container.textContent).toContain("Current access stays in place until they accept");
    await act(async () => { option("Website", "Prepare").click(); option("Google", "Not this").click(); option("Bookings", "Full control").click(); });
    await act(async () => byText("Send to North Studio")!.click());
    expect(writes).toEqual([{ workspaceId: WORKSPACE, agencyWorkspaceId: NORTH, scopes: [{ scope: "website", level: "prepare" }, { scope: "bookings", level: "full_control" }] }]);
    expect(container.textContent).toContain("Current: Website · Full control, Google · Prepare");
    expect(container.textContent).toContain("Proposed: Website · Prepare, Bookings · Full control");
    expect(container.textContent).toContain("Nothing changes until they accept");
    await act(async () => byText("Change access")!.click());
    expect(option("Website", "Prepare").getAttribute("aria-checked")).toBe("true");
    expect(option("Google", "Not this").getAttribute("aria-checked")).toBe("true");
  });

  it("requires at least one replacement area and keeps End access available for removal", async () => {
    await mount(async () => json({ directory: [], agencies: [{ agencyWorkspaceId: NORTH, name: "North Studio", seat: true, ofRecord: true,
      scopes: [{ scope: "website", level: "prepare", status: "active" }] }] }));
    await act(async () => byText("Change access")!.click());
    const website = container.querySelector('[aria-label="Website for North Studio"]')!;
    await act(async () => [...website.querySelectorAll("button")].find(button => button.textContent === "Not this")!.click());
    expect(byText("Send to North Studio")!.disabled).toBe(true);
    expect(byText("End access")!.disabled).toBe(false);
    expect(container.textContent).toContain("To remove every area now, use End access");
  });

  it("does not offer current agencies again in the directory, and Cancel keeps access unchanged", async () => {
    const writes = vi.fn();
    await mount(async (_input, init) => {
      if (init?.method) writes(init);
      return json({ directory: [{ agencyWorkspaceId: NORTH, name: "North Studio", summary: "Websites" }],
        agencies: [{ agencyWorkspaceId: NORTH, name: "North Studio", seat: true, ofRecord: true, scopes: [{ scope: "website", level: "prepare", status: "active" }] }] });
    });
    expect(container.textContent).not.toContain("Agencies you can bring in");
    await act(async () => byText("Change access")!.click());
    await act(async () => byText("Cancel")!.click());
    expect(writes).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Current: Website · Prepare");
  });

  it("keeps the proposed choices available when the server rejects an amendment", async () => {
    await mount(async (_input, init) => init?.method ? json({ error: "Another agency already has full control." }, 409) : json({ directory: [],
      agencies: [{ agencyWorkspaceId: NORTH, name: "North Studio", seat: true, ofRecord: true, scopes: [{ scope: "website", level: "prepare", status: "active" }] }] }));
    await act(async () => byText("Change access")!.click());
    await act(async () => byText("Send to North Studio")!.click());
    expect(container.textContent).toContain("Another agency already has full control.");
    expect(byText("Send to North Studio")).toBeDefined();
    expect(container.textContent).toContain("Current: Website · Prepare");
  });

  it("re-reads an unconfirmed amendment before allowing another proposal", async () => {
    let reads = 0;
    await mount(async (_input, init) => {
      if (init?.method === "POST") throw new TypeError("Connection lost");
      reads++;
      return json({ directory: [], agencies: [{ agencyWorkspaceId: NORTH, name: "North Studio", seat: true, ofRecord: true,
        scopes: [{ scope: "website", level: "prepare", status: reads === 1 ? "active" : "proposed" }] }] });
    });
    await act(async () => byText("Change access")!.click());
    await act(async () => byText("Send to North Studio")!.click());
    expect(reads).toBe(2);
    expect(container.textContent).toContain("Outcome not confirmed");
    expect(container.textContent).toContain("Proposed: Website · Prepare");
    expect(byText("Send to North Studio")).toBeUndefined();
    expect(byText("Change access")).toBeDefined();
  });

  it("lets only an owner bring in or end agencies, and reports a failed load honestly", async () => {
    await mount(async () => json({ directory: [], agencies: [{ agencyWorkspaceId: NORTH, name: "North Studio", seat: true, ofRecord: true, scopes: [] }] }), false);
    expect(container.textContent).toContain("Only an owner can bring in, change or end an agency.");
    expect(byText("End access")).toBeUndefined();
    expect(byText("Change access")).toBeUndefined();
    await act(async () => root!.unmount()); container.remove();
    await mount(async () => json({ error: "Agencies couldn't be loaded. Nothing changed." }, 503));
    expect(container.textContent).toContain("Agencies couldn't be loaded. Nothing changed.");
    expect(byText("Try again")).toBeDefined();
  });
});
