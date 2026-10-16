// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClaimOwned, OwnerClaimAcceptance } from "@/experience/workspace/agency/OwnerClaimAcceptance";
import { ClaimNextSteps, claimReviewInput, initialClaimReviewChoices } from "@/experience/workspace/agency/OwnerClaimReview";
import type { ClaimReview } from "@/products/agency-clients/contracts";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

const WS = "00000000-0000-4000-8000-000000000013";
const preview = { workspaceName: "Fictional Bakery", agencyName: "Fictional Studio", recipientEmail: "owner@example.invalid", status: "pending", expiresAt: "2026-10-26T12:00:00Z" };
const review: ClaimReview = { status: "pending", workspaceId: WS, workspaceName: "Fictional Bakery", agencyWorkspaceId: "00000000-0000-4000-8000-0000000000a1", agencyName: "Fictional Studio",
  found: [
    { id: "00000000-0000-4000-8000-0000000000f1", entity: "fact", key: "phone", value: "(716) 555-0100", sourceUrl: "https://bakery.example.invalid/contact", quote: "Call (716) 555-0100", status: "unconfirmed", sourceKind: "website_crawl", sourceRef: "https://bakery.example.invalid/contact", foundBy: "agency", foundAt: "2026-10-12T12:00:00.000Z" },
    { id: "00000000-0000-4000-8000-0000000000f2", entity: "fact", key: "hours", value: { weekly: [{ day: 1, opens: "07:00", closes: "15:00" }] }, sourceUrl: "https://bakery.example.invalid/", quote: "Mo 07:00-15:00", status: "unconfirmed", sourceKind: "website_crawl", sourceRef: "https://bakery.example.invalid/", foundBy: "agency", foundAt: "2026-10-12T12:00:00.000Z" },
    { id: "00000000-0000-4000-8000-0000000000f3", entity: "service", key: null, value: { name: "Custom cakes" }, sourceUrl: "https://bakery.example.invalid/services", quote: "Custom cakes", status: "unconfirmed", sourceKind: "website_crawl", sourceRef: "https://bakery.example.invalid/services", foundBy: "agency", foundAt: "2026-10-12T12:00:00.000Z" },
    { id: "00000000-0000-4000-8000-0000000000f4", entity: "person", key: null, value: { name: "Pat Baker" }, sourceUrl: "https://bakery.example.invalid/about", quote: "Pat Baker", status: "unconfirmed", sourceKind: "website_crawl", sourceRef: "https://bakery.example.invalid/about", foundBy: "agency", foundAt: "2026-10-12T12:00:00.000Z" },
  ],
  prepared: [{ id: "00000000-0000-4000-8000-0000000000b1", name: "Order form", kind: "intake" }], fullControlTaken: ["google"] };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const radio = (group: string, label: string) => Array.from(container.querySelectorAll<HTMLButtonElement>(`[role="radiogroup"][aria-label="${group}"] [role="radio"]`)).find(b => b.textContent === label)!;
async function click(text: string) {
  const button = Array.from(container.querySelectorAll("button")).find(value => value.textContent === text)!;
  expect(button).toBeTruthy(); await act(async () => button.click());
}

describe("owner claim review", () => {
  it("signed out: shows only the public preview and a sign-in path, never the found facts", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({ claim: preview })).mockResolvedValueOnce(json({ error: "Sign in" }, 401)); vi.stubGlobal("fetch", fetch);
    await act(async () => root.render(createElement(OwnerClaimAcceptance, { token: "t", review: true })));
    expect(container.textContent).toContain("Sign in with owner@example.invalid");
    expect(container.textContent).not.toContain("(716) 555-0100");
    expect(container.querySelector('a[href="/sign-in?next=%2Fworkspace%2Fclaim%2Ft"]')).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("signed in: shows found facts with sources and drafts, defaults every area to Prepare, and claims with the owner's choices", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({ claim: preview })).mockResolvedValueOnce(json({ review }))
      .mockResolvedValueOnce(json({ accepted: { workspaceId: WS, workspaceName: "Fictional Bakery", status: "accepted", alreadyAccepted: false } }));
    vi.stubGlobal("fetch", fetch);
    await act(async () => root.render(createElement(OwnerClaimAcceptance, { token: "t", review: true })));
    expect(container.textContent).toContain("We found these on your website");
    expect(container.textContent).toContain("Call (716) 555-0100");
    expect(container.querySelector('a[href="https://bakery.example.invalid/contact"]')).toBeTruthy();
    expect(container.textContent).toContain("Order form");
    expect(container.textContent).toContain("Draft");
    for (const area of ["Website", "Inquiries", "Bookings", "Google", "Internal tools"]) {
      expect(radio(`${area} for Fictional Studio`, "Prepare").getAttribute("aria-checked")).toBe("true");
    }
    expect(radio("Google for Fictional Studio", "Full control").disabled).toBe(true);
    expect(container.textContent).toContain("Payment, adding and ending agencies, your data and leaving Strelva always stay with you.");

    await act(async () => radio("Person: Pat Baker", "Remove").click());
    await act(async () => radio("Service: Custom cakes", "Later").click());
    await act(async () => radio("Website for Fictional Studio", "Full control").click());
    await act(async () => radio("Inquiries for Fictional Studio", "Not this").click());
    await click("Claim my business");
    const [url, init] = fetch.mock.calls[2]!;
    expect(url).toBe("/api/workspace-claims/t/review");
    const body = JSON.parse(init.body);
    expect(body.areas).toEqual({ website: "full_control", inquiries: "none", bookings: "prepare", google: "prepare", internal_tools: "prepare" });
    expect(body.facts).toContainEqual({ id: "00000000-0000-4000-8000-0000000000f1", decision: "confirm" });
    expect(body.facts).toContainEqual({ id: "00000000-0000-4000-8000-0000000000f4", decision: "remove" });
    expect(body.facts.find((item: { id: string }) => item.id.endsWith("f2")).value.timezone).toEqual(expect.any(String));
    expect(body.facts).toContainEqual({ id: "00000000-0000-4000-8000-0000000000f3", decision: "later" });
    expect(container.textContent).toContain("Fictional Bakery is yours");
    expect(container.textContent).toContain("Connect Google");
  });

  it("change sends the corrected value; later is sent as later and stays waiting", () => {
    const choices = initialClaimReviewChoices(review, "America/New_York");
    choices.facts["00000000-0000-4000-8000-0000000000f1"] = "change";
    choices.drafts["00000000-0000-4000-8000-0000000000f1"] = " (716) 555-0199 ";
    choices.facts["00000000-0000-4000-8000-0000000000f4"] = "later";
    const input = claimReviewInput(review, choices);
    expect(input.facts).toContainEqual({ id: "00000000-0000-4000-8000-0000000000f1", decision: "change", value: "(716) 555-0199" });
    expect(input.facts).toContainEqual({ id: "00000000-0000-4000-8000-0000000000f2", decision: "confirm", value: { weekly: [{ day: 1, opens: "07:00", closes: "15:00" }], timezone: "America/New_York" } });
    expect(input.facts).toContainEqual({ id: "00000000-0000-4000-8000-0000000000f4", decision: "later" });
  });

  it("next steps link to the existing Google and calendar connections, and each can be skipped", async () => {
    const navigate = vi.fn();
    await act(async () => root.render(createElement(ClaimNextSteps, { workspaceId: WS, workspaceName: "Fictional Bakery", returnTo: "/workspace/claim/t", navigate })));
    await click("Connect Google");
    expect(navigate).toHaveBeenCalledWith(`/workspace/google?workspaceId=${WS}&returnTo=%2Fworkspace%2Fclaim%2Ft`);
    await click("Connect calendar");
    expect(navigate).toHaveBeenCalledWith(`/api/workspace/calendar-connections/oauth/google?workspaceId=${WS}`);
    const skips = Array.from(container.querySelectorAll("button")).filter(b => b.textContent === "Skip");
    for (const skip of skips) await act(async () => skip.click());
    expect(container.textContent?.match(/Skipped/g)).toHaveLength(2);
    // The way into the business is the owner page's one primary (ClaimOwned), not a second pill here.
    expect(container.querySelector(`a[href="/workspace?workspaceId=${WS}"]`)).toBeNull();
  });

  it("the owned page has one way in, and names the agency's changes as coming to the owner first", async () => {
    await act(async () => root.render(createElement(ClaimOwned, { workspaceId: WS, workspaceName: "Fictional Bakery", agencyName: "Fictional Studio", lead: "Your choices are saved." })));
    expect(container.querySelector(`a[href="/workspace?workspaceId=${WS}"]`)?.textContent).toBe("Open your business");
    expect(container.querySelectorAll("[data-xa-primary]")).toHaveLength(1);
    expect(container.textContent).toContain("Fictional Studio’s changes come to you first.");
  });
});
