// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgencyProposals } from "@/experience/workspace/agency/AgencyProposals";

const AGENCY = "44444444-4444-4444-8444-444444444444";
const PROPOSAL = "a".repeat(64);
const REPLACEMENT = "b".repeat(64);
const BAKERY = "55555555-5555-4555-8555-555555555555";
let root: Root | undefined;
let container: HTMLDivElement;
afterEach(async () => { await act(async () => root?.unmount()); container?.remove(); vi.unstubAllGlobals(); });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
async function mount(transport: (input: string, init?: RequestInit) => Promise<Response>, canManage = true) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => { root!.render(createElement(AgencyProposals, { agencyWorkspaceId: AGENCY, agencyName: "North Studio", canManage, transport })); });
}
const byText = (text: string) => [...container.querySelectorAll("button")].find(button => button.textContent?.includes(text));

describe("Businesses asking an agency in (ADR 0015)", () => {
  it("shows what the business chose and accepts it", async () => {
    const posts: unknown[] = [];
    await mount(async (input, init) => {
      if (init?.method === "POST") { posts.push({ input, body: JSON.parse(String(init.body)) }); return json({ status: "accepted" }); }
      return json({ proposals: [{ proposalId: PROPOSAL, businessWorkspaceId: BAKERY, businessName: "Bakery", consent: "I bring in North Studio for Website (full control).", proposedAt: "2026-10-11T00:00:00Z", scopes: [{ scope: "website", level: "full_control" }] }], listing: { listed: true, summary: "Websites for bakeries" } });
    });
    expect(container.textContent).toContain("Website · Full control");
    expect(container.textContent).toContain("I bring in North Studio for Website (full control).");
    expect(container.querySelector<HTMLButtonElement>('[role="switch"]')!.getAttribute("aria-checked")).toBe("true");
    await act(async () => byText("Accept")!.click());
    expect(posts).toEqual([{ input: "/api/workspace/agency-proposals", body: { agencyId: AGENCY, businessId: BAKERY, proposalId: PROPOSAL, accept: true } }]);
    expect(container.textContent).toContain("Bakery is now a client");
    expect(container.textContent).toContain("No businesses are waiting on you.");
  });

  it("keeps changed terms unaccepted until the agency refreshes and reviews them", async () => {
    let reads = 0;
    const posts: Array<{ proposalId: string }> = [];
    await mount(async (_input, init) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)); posts.push(body);
        return posts.length === 1 ? json({ error: "This request changed. Refresh requests and review the current access before responding." }, 409) : json({ status: "accepted" });
      }
      reads++;
      return json({ proposals: [{ proposalId: reads === 1 ? PROPOSAL : REPLACEMENT, businessWorkspaceId: BAKERY, businessName: "Bakery", consent: reads === 1 ? "Old terms" : "New owner terms", proposedAt: "2026-10-12T00:00:00Z", scopes: [{ scope: "website", level: reads === 1 ? "prepare" : "full_control" }] }] });
    });
    await act(async () => byText("Accept")!.click());
    expect(container.textContent).toContain("This request changed");
    expect(container.textContent).not.toContain("Bakery is now a client");
    expect(byText("Accept")!.disabled).toBe(true);
    expect(posts[0]?.proposalId).toBe(PROPOSAL);
    await act(async () => byText("Refresh requests")!.click());
    expect(container.textContent).toContain("New owner terms");
    expect(container.textContent).toContain("Website · Full control");
    expect(byText("Accept")!.disabled).toBe(false);
    await act(async () => byText("Accept")!.click());
    expect(posts[1]?.proposalId).toBe(REPLACEMENT);
    expect(container.textContent).toContain("Bakery is now a client");
  });

  it("does not claim acceptance from a malformed success response", async () => {
    await mount(async (_input, init) => init?.method === "POST" ? json({}) : json({ proposals: [{ proposalId: PROPOSAL, businessWorkspaceId: BAKERY, businessName: "Bakery", consent: "Reviewed terms", proposedAt: "2026-10-12T00:00:00Z", scopes: [{ scope: "website", level: "prepare" }] }] }));
    await act(async () => byText("Accept")!.click());
    expect(container.textContent).toContain("Refresh before trying again");
    expect(container.textContent).not.toContain("Bakery is now a client");
    expect(byText("Accept")!.disabled).toBe(true);
  });

  it("renders nothing for agency members who can't accept", async () => {
    const transport = vi.fn();
    await mount(transport, false);
    expect(container.textContent).toBe("");
    expect(transport).not.toHaveBeenCalled();
  });
});
