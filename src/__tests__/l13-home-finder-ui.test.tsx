// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeFinderBuyer } from "@/experience/enterprise/HomeFinderBuyer";

let root: Root;
let container: HTMLDivElement;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const bindingId = "b2770000-0000-4000-8000-000000000010";
const listing = { id: "fictional", inquiryToken: "fictional-listing-token", address: { line: "[Home address]", city: "[City]", state: "NY", postalCode: "[Postal code]", latitude: null, longitude: null }, price: 325000, bedrooms: 3, bathrooms: 2, publicRemarks: null, photos: [], listAgentName: null, listOfficeName: null, sourceSystemName: null, modifiedAt: null, status: "active" };
const search = { source: { id: "trestle", name: "Fictional source", mode: "live", isLive: true, description: "Fixture only", freshnessWindowMinutes: 30 }, fetchedAt: "2026-10-09T14:00:00Z", sourceCheckedAt: "2026-10-09T14:00:00Z", count: 1, listings: [listing] };
async function click(text: string) {
  const button = Array.from(container.querySelectorAll("button")).find(item => item.textContent === text);
  expect(button).toBeTruthy();
  await act(async () => button!.click());
}
async function fill(label: string, value: string) {
  const labelNode = Array.from(container.querySelectorAll("label")).find(item => item.textContent === label)!;
  const field = container.querySelector<HTMLInputElement>(`[id="${labelNode.htmlFor}"]`)!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value); field.dispatchEvent(new Event("input", { bubbles: true })); });
}

describe("L13 Home Finder retained buyer behavior", () => {
  it("retains consent, entry renewal, a locked failed inquiry and the same submission on retry", async () => {
    let attempts = 0;
    const request = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input), "http://localhost");
      if (url.searchParams.has("renew")) return Response.json({ token: "renewed-fixture-token" });
      if (init?.method === "POST") {
        attempts++;
        if (attempts === 1) return Response.json({}, { status: 503 });
        const body = JSON.parse(String(init.body)) as { submissionId: string };
        return Response.json({ status: "pending", requestId: body.submissionId, reference: "fixture-receipt", message: "Inquiry queued" });
      }
      return Response.json(search);
    });
    await act(async () => root.render(createElement(HomeFinderBuyer, { bindingId, entryToken: "fixture-entry", brokerageName: "[Brokerage]", request })));
    await fill("City, area or address", "Buffalo"); await click("Search homes");
    expect(container.textContent).toContain("[Home address]");
    expect(container.textContent).toContain("Listing contact: Not supplied");
    await click("Ask about [Home address]");
    await fill("Your name", "[Buyer]"); await fill("Email", "buyer@example.test");
    expect(Array.from(container.querySelectorAll("button")).find(item => item.textContent === "Send inquiry")?.disabled).toBe(true);
    await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    await click("Send inquiry");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Delivery could not be confirmed");
    expect(container.querySelector<HTMLInputElement>('input[type="email"]')?.disabled).toBe(true);
    await click("Retry the same inquiry");
    const submissions = request.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(submissions).toHaveLength(2);
    expect(submissions[0]![1]?.body).toBe(submissions[1]![1]?.body);
    expect(JSON.parse(String(submissions[1]![1]?.body))).toMatchObject({ consent: true, listing: { id: listing.id, inquiryToken: listing.inquiryToken }, buyer: { name: "[Buyer]", email: "buyer@example.test" } });
    expect(submissions[1]![1]).toMatchObject({ credentials: "omit", headers: { "x-home-finder-entry": "renewed-fixture-token" } });
    expect(container.textContent).toContain("Inquiry queued");
    expect(container.textContent).toContain("Only verified delivery evidence confirms");
    expect(container.textContent).not.toContain("Send inquiry");
  });

  it("keeps unavailable searches distinct from a successful empty result", async () => {
    let unavailable = true;
    const request = vi.fn<typeof fetch>(async input => String(input).includes("renew=1") ? Response.json({ token: "fixture-entry" }) : unavailable ? Response.json({}, { status: 503 }) : Response.json({ ...search, count: 0, listings: [] }));
    await act(async () => root.render(createElement(HomeFinderBuyer, { bindingId, entryToken: "fixture-entry", brokerageName: "[Brokerage]", request })));
    await click("Search homes");
    expect(container.textContent).toContain("Licensed listings are currently unavailable");
    expect(container.textContent).not.toContain("No displayable homes");
    unavailable = false; await click("Search homes");
    expect(container.textContent).toContain("No displayable homes match this search");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});
