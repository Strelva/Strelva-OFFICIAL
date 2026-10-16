// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BusinessBillingView } from "@/experience/workspace/billing/BusinessBillingView";
import { WorkspaceExit } from "@/experience/workspace/WorkspaceExit";
import type { BusinessBilling } from "@/platform/business-billing";

const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
function host() { const node = document.createElement("div"); document.body.append(node); const root = createRoot(node); roots.push(root); return { node, root }; }
const button = (node: HTMLElement, name: string) => [...node.querySelectorAll("button")].find(item => item.textContent === name)!;
const ownBilling = { workspaceId: "business", payerParty: { kind: "business", workspaceId: "business", name: "Harbor Dental" }, payer: { name: "Dr. Amy Lin" }, paymentStatus: "active", state: "subscription", sites: [], monthlyCents: 15000, paidThrough: "2026-11-01" } as unknown as BusinessBilling;
const props = { billing: ownBilling, backHref: "/workspace/business-details?workspaceId=business", workspaceId: "business", canManage: true };

it("opens the selected business's payment management without a dashboard link", async () => {
  const { node, root } = host(); const navigate = vi.fn();
  const transport = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(async () => Response.json({ portalUrl: "https://billing.stripe.com/p/owner" }));
  await act(async () => root.render(createElement(BusinessBillingView, { ...props, transport, navigate })));
  await act(async () => button(node, "Card and receipts").click());
  expect(JSON.parse(transport.mock.calls[0]![1]!.body as string)).toEqual({ workspaceId: "business", action: "manage" });
  expect(navigate).toHaveBeenCalledWith("https://billing.stripe.com/p/owner");
  expect(node.innerHTML).not.toContain("/dashboard");
});
it("requires reviewing cancellation before opening the exact hosted flow", async () => {
  const { node, root } = host(); const navigate = vi.fn();
  const transport = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(async () => Response.json({ portalUrl: "https://billing.stripe.com/p/cancel" }));
  await act(async () => root.render(createElement(BusinessBillingView, { ...props, transport, navigate })));
  expect(button(node, "Continue to Stripe")).toBeUndefined();
  await act(async () => button(node, "End the plan").click());
  expect(transport).not.toHaveBeenCalled(); expect(node.textContent).toContain("you confirm it there");
  expect(node.textContent).toContain("Leaving Strelva doesn’t end it on its own");
  expect(node.textContent).toContain("Until you do, the plan keeps running");
  await act(async () => button(node, "Continue to Stripe").click());
  expect(JSON.parse(transport.mock.calls[0]![1]!.body as string)).toEqual({ workspaceId: "business", action: "cancel" });
  expect(navigate).toHaveBeenCalledOnce();
});
it("never shows a price, and no card controls before billing is set up", async () => {
  const { node, root } = host();
  await act(async () => root.render(createElement(BusinessBillingView, { ...props })));
  expect(node.textContent).toContain("is paid through November 1, 2026."); expect(node.textContent).not.toContain("$");
  await act(async () => root.render(createElement(BusinessBillingView, { ...props, billing: null })));
  expect(node.textContent).toContain("billing isn’t set up here yet"); expect(button(node, "Card and receipts")).toBeUndefined();
});
it("shows no payer controls to nonowners or agency-paid businesses", async () => {
  const { node, root } = host();
  await act(async () => root.render(createElement(BusinessBillingView, { ...props, canManage: false })));
  expect(button(node, "Card and receipts")).toBeUndefined();
  const billing = { workspaceId: "business", payerParty: { kind: "agency", workspaceId: "agency", name: "Cedar" }, paymentStatus: "active", state: "subscription", sites: [], monthlyCents: 15000 } as unknown as BusinessBilling;
  await act(async () => root.render(createElement(BusinessBillingView, { ...props, billing })));
  expect(button(node, "Card and receipts")).toBeUndefined(); expect(node.textContent).toContain("Cedar manages the card and receipts");
});
it("preserves cancellation review on provider failure and refuses foreign navigation", async () => {
  const { node, root } = host(); const navigate = vi.fn();
  const transport = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(async () => Response.json({ error: "Billing is unavailable." }, { status: 503 }));
  await act(async () => root.render(createElement(BusinessBillingView, { ...props, transport, navigate })));
  await act(async () => button(node, "End the plan").click());
  await act(async () => button(node, "Continue to Stripe").click());
  expect(node.textContent).toContain("Billing is unavailable."); expect(button(node, "Continue to Stripe").disabled).toBe(false);
  transport.mockResolvedValue(Response.json({ portalUrl: "https://foreign.example" }));
  await act(async () => button(node, "Continue to Stripe").click());
  expect(node.textContent).toContain("doesn’t trust"); expect(navigate).not.toHaveBeenCalled();
});
it("aborts a prior workspace's portal request and ignores its late capability", async () => {
  const { node, root } = host(); const navigate = vi.fn(); let resolve!: (value: Response) => void;
  const pending = new Promise<Response>(done => { resolve = done; });
  const transport = vi.fn((_url: string, _init?: RequestInit) => pending);
  await act(async () => root.render(createElement(BusinessBillingView, { ...props, transport, navigate })));
  await act(async () => button(node, "Card and receipts").click());
  expect(button(node, "End the plan").disabled).toBe(true);
  await act(async () => root.render(createElement(BusinessBillingView, { ...props, workspaceId: "other", transport, navigate })));
  expect(transport.mock.calls[0]![1]!.signal?.aborted).toBe(true);
  await act(async () => resolve(Response.json({ portalUrl: "https://billing.stripe.com/p/old" })));
  expect(navigate).not.toHaveBeenCalled(); expect(button(node, "Card and receipts").disabled).toBe(false);
});
it.each([null, { futureWork: "paused", providerParticipation: "kept", maintainedResources: { kind: "stopped" }, completedAt: "2026-10-12T12:00:00Z", summary: {}, retainedObligations: [] }])("keeps workspace billing reachable before and after departure", async state => {
  const { node, root } = host(); const request = vi.fn<typeof fetch>(async () => Response.json({ state, successors: [] }));
  await act(async () => root.render(createElement(WorkspaceExit, { workspaceId: "business", request, businessBillingReleased: true })));
  const link = [...node.querySelectorAll("a")].find(item => item.textContent === "Manage payments or cancel your plan");
  expect(link?.getAttribute("href")).toBe("/workspace/billing?workspaceId=business"); expect(node.innerHTML).not.toContain("/dashboard");
});
it("puts Pay directly instead in Pebble's past-due line, names the agency and asks for a business payer", async () => {
  const { node, root } = host();
  const transport = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(async () => Response.json({ transitions: [], current: null, pending: null }));
  const heard = vi.fn(); window.addEventListener("strelva:payer-transition", heard);
  const billing = { workspaceId: "business", payerParty: { kind: "agency", workspaceId: "agency", name: "North Studio" }, paymentStatus: "past_due", state: "subscription", sites: [], monthlyCents: 15000 } as unknown as BusinessBilling;
  await act(async () => root.render(createElement(BusinessBillingView, { ...props, billing, transport })));
  expect(node.textContent).toContain("North Studio’s last payment for This business didn’t go through.");
  expect(node.textContent).not.toContain("$");
  await act(async () => button(node, "Pay for it yourself instead").click());
  expect(transport).toHaveBeenCalledWith("/api/work-economics/payer-transition", expect.objectContaining({ method: "POST" }));
  expect(JSON.parse(String(transport.mock.calls[0]![1]!.body))).toEqual({ action: "propose", workspaceId: "business", successorKind: "business" });
  expect(heard).toHaveBeenCalledOnce(); expect(node.textContent).toContain("You asked to pay for it yourself");
  expect(button(node, "Pay for it yourself instead")).toBeUndefined();
  window.removeEventListener("strelva:payer-transition", heard);
});
it("offers no Pay directly instead to someone who cannot manage billing", async () => {
  const { node, root } = host();
  const billing = { workspaceId: "business", payerParty: { kind: "agency", workspaceId: "agency", name: "North Studio" }, paymentStatus: "past_due", state: "subscription", sites: [], monthlyCents: 15000 } as unknown as BusinessBilling;
  await act(async () => root.render(createElement(BusinessBillingView, { ...props, billing, canManage: false })));
  expect(button(node, "Pay for it yourself instead")).toBeUndefined();
});
