// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgencyProposals } from "@/experience/workspace/agency/AgencyProposals";

const AGENCY = "44444444-4444-4444-8444-444444444444";
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
      return json({ proposals: [{ businessWorkspaceId: BAKERY, businessName: "Bakery", consent: "I bring in North Studio for Website (full control).", proposedAt: "2026-10-11T00:00:00Z", scopes: [{ scope: "website", level: "full_control" }] }], listing: { listed: true, summary: "Websites for bakeries" } });
    });
    expect(container.textContent).toContain("Website · Full control");
    expect(container.textContent).toContain("I bring in North Studio for Website (full control).");
    expect(container.querySelector<HTMLButtonElement>('[role="switch"]')!.getAttribute("aria-checked")).toBe("true");
    await act(async () => byText("Accept")!.click());
    expect(posts).toEqual([{ input: "/api/workspace/agency-proposals", body: { agencyId: AGENCY, businessId: BAKERY, accept: true } }]);
    expect(container.textContent).toContain("Bakery is now a client");
    expect(container.textContent).toContain("No businesses are waiting on you.");
  });

  it("renders nothing for agency members who can't accept", async () => {
    const transport = vi.fn();
    await mount(transport, false);
    expect(container.textContent).toBe("");
    expect(transport).not.toHaveBeenCalled();
  });
});
