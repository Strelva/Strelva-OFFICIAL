// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgencyAddClient } from "@/experience/workspace/agency/AgencyAddClient";
import type { AgencyClientListItem } from "@/products/agency-clients/contracts";

// A client added earlier gets a fresh owner link from the add-client page,
// which is where the Queue's "Claim not sent" item lands. Email stays held.

const agency = "00000000-0000-4000-8000-000000000001";
const business = "00000000-0000-4000-8000-000000000002";
const oldClaim = "00000000-0000-4000-8000-000000000006";
const newClaim = "00000000-0000-4000-8000-000000000007";
const delivery = { status: "not_sent", reason: "gated", decision: "R08", agencyEmailVerified: false } as const;
const client: AgencyClientListItem = {
  additionId: "00000000-0000-4000-8000-000000000003", agencyWorkspaceId: agency, customerWorkspaceId: business,
  name: "Door Bakery", sourceKind: "url", sourceUrl: "https://door.example.test", prospectId: null,
  factsSeeded: 0, seatId: "00000000-0000-4000-8000-000000000004", addedBy: "00000000-0000-4000-8000-000000000005",
  addedAt: "2026-10-12T10:00:00.000Z", replayed: false, ownerClaimed: false, seatActive: true,
  pendingClaim: { claimId: oldClaim, recipientEmail: "owner@door.example.test", expiresAt: "2099-01-01T00:00:00.000Z", delivery },
};
const issued = {
  claimId: newClaim, customerWorkspaceId: business, workspaceName: "Door Bakery", recipientEmail: "owner@door.example.test", delivery,
  expiresAt: "2099-01-01T00:00:00.000Z", createdAt: "2026-10-15T10:00:00.000Z", replacedPending: true, claimPath: `/workspace/claim/${"a".repeat(43)}`,
};

let root: Root | undefined;
let container: HTMLDivElement;
const props = { agencyWorkspaceId: agency, prospecting: false, initialProspectId: null };
async function mount(extra: { initialClientId?: string | null } = {}) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root!.render(createElement(AgencyAddClient, { ...props, ...extra })));
}
const button = (name: string) => [...container.querySelectorAll("button")].find(item => item.textContent?.trim() === name);
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; container?.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("fresh owner link for an earlier client", () => {
  it("says the claim was not sent and keeps the form closed until asked", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ clients: [client] })));
    await mount();
    expect(container.textContent).toContain("Claim not sent: email to owners is off. Link for owner@door.example.test");
    expect(button("New owner link")).toBeDefined();
    expect(container.textContent).not.toContain("Create owner link");
    expect(container.textContent).not.toContain("Replace pending owner link");
  });

  it("opens the form for the client the Queue linked to, and a claimed client gets none", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ clients: [client] })));
    await mount({ initialClientId: business });
    expect(button("Replace pending owner link")).toBeDefined();
    await act(async () => root!.unmount()); container.remove();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ clients: [{ ...client, ownerClaimed: true, pendingClaim: null }] })));
    await mount({ initialClientId: business });
    expect(button("New owner link")).toBeUndefined();
    expect(container.textContent).toContain("Owner signed in");
  });

  it("creates a link without asking for email, then offers Copy link and says it was not sent", async () => {
    let reads = 0;
    const request = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") return Response.json({ ownerClaim: issued });
      reads += 1;
      return Response.json({ clients: [reads > 2 ? { ...client, pendingClaim: { ...client.pendingClaim!, claimId: newClaim } } : client] });
    });
    vi.stubGlobal("fetch", request);
    await mount({ initialClientId: business });
    const input = [...container.querySelectorAll<HTMLInputElement>('input[type="email"]')].at(-1)!; // the form inside the client row
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "owner@door.example.test");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => button("Replace pending owner link")!.click());
    const post = request.mock.calls.find(([, init]) => init?.method === "POST")!;
    const sent = JSON.parse(String(post[1]!.body));
    expect(sent).toMatchObject({ action: "owner_link", agencyWorkspaceId: agency, customerWorkspaceId: business });
    expect(sent).not.toHaveProperty("sendEmail");
    expect(button("Copy link")).toBeDefined();
    expect(container.textContent).toContain("Claim not sent: email to owners is off.");
  });
});
