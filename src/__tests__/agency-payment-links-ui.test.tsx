// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AgencyPaymentLinks } from "@/experience/workspace/billing/AgencyPaymentLinks";

const agency = "11111111-1111-4111-8111-111111111111";
const actor = "44444444-4444-4444-8444-444444444444";
const legacy = { slug: "coffee", clientName: "Coffee Co", door: "build", amountCents: 50000, leadSlug: "coffee", createdAt: "2026-07-01", createdBy: "old@example.test" };
const snapshot = (extra: Record<string, unknown> = {}) => ({ agency: { id: agency, name: "Strelva Agency", role: "owner" }, currentActorId: actor, legacyMerchant: true, checkoutAvailability: { status: "coming_soon" }, payLinks: [legacy], paidPayments: { coffee: { amountCents: 50000, paidAt: "2026-10-12" } }, paymentStatusAvailable: true, clients: [{ customerWorkspaceId: "33333333-3333-4333-8333-333333333333", name: "Client Coffee" }], ...extra });
const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("FormData", window.FormData); });
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
async function render(request: typeof fetch) {
  const node = document.createElement("div"); document.body.append(node); const root = createRoot(node); roots.push(root);
  await act(async () => root.render(<AgencyPaymentLinks agencyWorkspaceId={agency} request={request} />));
  return node;
}
const button = (node: HTMLElement, label: string) => [...node.querySelectorAll("button")].find(item => item.textContent === label)!;
async function submit(node: HTMLElement) {
  (node.querySelector('[name="clientName"]') as HTMLInputElement).value = "Prospect Coffee";
  (node.querySelector('[name="description"]') as HTMLInputElement).value = "Agreed build";
  (node.querySelector('[name="amount"]') as HTMLInputElement).value = "500";
  await act(async () => node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}
function saved(body: Record<string, unknown>) {
  return { ...legacy, clientName: body.clientName, slug: "saved-coffee", agencyWorkspaceId: agency, agencyDisplayName: "Strelva Agency", createdBy: actor, customCopy: body.description, amountCents: body.amountCents, minCents: body.minCents, maxCents: body.maxCents, businessWorkspaceId: body.businessWorkspaceId };
}

it("shows paid status and historical attribution without inventing the old actor", async () => {
  const node = await render(vi.fn<typeof fetch>().mockResolvedValue(Response.json(snapshot())));
  expect(node.textContent).toContain("Created before agency ownership was recorded · Actor not recorded");
  expect(node.textContent).not.toContain("old@example.test"); expect(node.textContent).toContain("Paid $500");
  expect(button(node, "Copy link")).toBeTruthy();
});
it.each(["coming_soon", "setup_required", "unavailable", "ready"])("other agencies see %s Connect state without legacy controls", async status => {
  const node = await render(vi.fn<typeof fetch>().mockResolvedValue(Response.json(snapshot({ legacyMerchant: false, checkoutAvailability: { status }, payLinks: [] }))));
  expect(node.querySelector("form")).toBeNull(); expect(button(node, "Create payment link")).toBeUndefined();
  expect(node.textContent).toContain("Stripe merchant account");
  if (status === "coming_soon") expect(node.textContent).toContain("Coming soon");
  if (status === "setup_required") expect(node.querySelector('a[href*="/workspace/payments"]')).toBeTruthy();
});
it("recovers a denied initial read with GET only", async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ error: "Access denied" }, { status: 403 })).mockResolvedValueOnce(Response.json(snapshot({ payLinks: [], paidPayments: {} })));
  const node = await render(request); expect(node.textContent).toContain("Access denied"); expect(node.querySelector("form")).toBeNull();
  await act(async () => button(node, "Refresh payment links").click());
  expect(node.textContent).toContain("No payment links recorded yet"); expect(request.mock.calls.every(([, init]) => !init?.method)).toBe(true);
});
it("labels payment uncertainty and expired records, with no copy or expire action for the latter", async () => {
  const node = await render(vi.fn<typeof fetch>().mockResolvedValue(Response.json(snapshot({ payLinks: [{ ...legacy, revokedAt: "2026-10-12" }], paidPayments: {}, paymentStatusAvailable: false }))));
  expect(node.textContent).toContain("Payment status unavailable"); expect(node.textContent).toContain("Expired"); expect(button(node, "Copy link")).toBeUndefined(); expect(button(node, "Expire link")).toBeUndefined();
});
it("holds exact create terms after a lost response and retries with the same idempotency key", async () => {
  const bodies: Record<string, unknown>[] = [];
  const request = vi.fn<typeof fetch>(async (_url, init) => {
    if (init?.method !== "POST") return Response.json(snapshot());
    const body = JSON.parse(String(init.body)); bodies.push(body);
    if (bodies.length === 1) throw new Error("Response lost");
    return Response.json({ payLink: saved(body) });
  });
  const node = await render(request); await submit(node);
  expect(button(node, "Create payment link").disabled).toBe(true); expect((node.querySelector('[name="amount"]') as HTMLInputElement).value).toBe("500");
  await act(async () => button(node, "Refresh payment links").click()); expect(bodies).toHaveLength(1); expect(button(node, "Create payment link").disabled).toBe(true);
  await act(async () => button(node, "Retry the same request").click());
  expect(bodies[1]).toEqual(bodies[0]); expect(bodies[0]).toMatchObject({ amountCents: 50000, description: "Agreed build", agencyWorkspaceId: agency });
  expect(node.textContent).toContain("Payment link saved"); expect(button(node, "Create payment link").disabled).toBe(false);
});
it("does not confirm an incomplete successful command response", async () => {
  const request = vi.fn<typeof fetch>(async (_url, init) => Response.json(init?.method === "POST" ? { payLink: { slug: "unexpected" } } : snapshot()));
  const node = await render(request); await submit(node);
  expect(node.textContent).toContain("awaiting confirmation"); expect(button(node, "Create payment link").disabled).toBe(true); expect(node.textContent).not.toContain("Payment link saved");
});
it("requires an explicit expire review and preserves the server's first revocation receipt", async () => {
  const request = vi.fn<typeof fetch>(async (_url, init) => {
    if (init?.method === "POST") return Response.json({ payLink: { ...legacy, revokedAt: "2026-10-12", revokedBy: actor } });
    return Response.json(snapshot());
  });
  const node = await render(request); await act(async () => button(node, "Expire link").click());
  expect(request).toHaveBeenCalledTimes(1); expect(node.textContent).toContain("Payments already started in Stripe may still complete");
  await act(async () => button(node, "Confirm expire").click());
  expect(JSON.parse(String(request.mock.calls[1]![1]?.body))).toMatchObject({ action: "revoke", agencyWorkspaceId: agency, slug: "coffee" });
  expect(node.textContent).toContain("Payment link expired");
});
it("copies the public payment URL and reports clipboard failure", async () => {
  const clipboard = vi.fn().mockResolvedValue(undefined); Object.defineProperty(navigator, "clipboard", { value: { writeText: clipboard }, configurable: true });
  const node = await render(vi.fn<typeof fetch>().mockResolvedValue(Response.json(snapshot())));
  await act(async () => button(node, "Copy link").click()); expect(clipboard).toHaveBeenCalledWith(new URL("/pay/coffee", window.location.origin).toString()); expect(node.textContent).toContain("Payment link copied");
  clipboard.mockRejectedValueOnce(new Error("denied")); await act(async () => button(node, "Copy link").click()); expect(node.textContent).toContain("Open the payment link and copy its address");
});

it("keeps an uncertain request held when later authorization is refused", async () => {
  const request = vi.fn<typeof fetch>(async (_url, init) => {
    if (init?.method !== "POST") return Response.json(snapshot());
    if (request.mock.calls.filter(([, config]) => config?.method === "POST").length === 1) throw new Error("Response lost");
    return Response.json({ error: "Access changed" }, { status: 403 });
  });
  const node = await render(request); await submit(node);
  await act(async () => button(node, "Retry the same request").click());
  expect(node.textContent).toContain("Access changed"); expect(node.textContent).toContain("awaiting confirmation"); expect(button(node, "Create payment link").disabled).toBe(true);
});
