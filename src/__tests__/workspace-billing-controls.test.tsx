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
const props = { billing: null, backHref: "/workspace/business-details?workspaceId=business", workspaceId: "business", canManage: true };

it("opens the selected business's payment management without a dashboard link", async () => {
  const { node, root } = host(); const navigate = vi.fn();
  const transport = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(async () => Response.json({ portalUrl: "https://billing.stripe.com/p/owner" }));
  await act(async () => root.render(createElement(BusinessBillingView, { ...props, transport, navigate })));
  await act(async () => button(node, "Manage payments and receipts").click());
  expect(JSON.parse(transport.mock.calls[0]![1]!.body as string)).toEqual({ workspaceId: "business", action: "manage" });
  expect(navigate).toHaveBeenCalledWith("https://billing.stripe.com/p/owner");
  expect(node.innerHTML).not.toContain("/dashboard");
});
it("requires reviewing cancellation before opening the exact hosted flow", async () => {
  const { node, root } = host(); const navigate = vi.fn();
  const transport = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(async () => Response.json({ portalUrl: "https://billing.stripe.com/p/cancel" }));
  await act(async () => root.render(createElement(BusinessBillingView, { ...props, transport, navigate })));
  expect(button(node, "Continue to cancellation")).toBeUndefined();
  await act(async () => button(node, "Review cancellation").click());
  expect(transport).not.toHaveBeenCalled(); expect(node.textContent).toContain("confirm cancellation");
  await act(async () => button(node, "Continue to cancellation").click());
  expect(JSON.parse(transport.mock.calls[0]![1]!.body as string)).toEqual({ workspaceId: "business", action: "cancel" });
  expect(navigate).toHaveBeenCalledOnce();
});
it("shows no payer controls to nonowners or agency-paid businesses", async () => {
  const { node, root } = host();
  await act(async () => root.render(createElement(BusinessBillingView, { ...props, canManage: false })));
  expect(button(node, "Manage payments and receipts")).toBeUndefined();
  const billing = { workspaceId: "business", payerParty: { kind: "agency", workspaceId: "agency", name: "Cedar" }, paymentStatus: "active", state: "subscription", sites: [], monthlyCents: 15000 } as unknown as BusinessBilling;
  await act(async () => root.render(createElement(BusinessBillingView, { ...props, billing })));
  expect(button(node, "Manage payments and receipts")).toBeUndefined(); expect(node.textContent).toContain("Your agency manages its payment method");
});
it("preserves cancellation review on provider failure and refuses foreign navigation", async () => {
  const { node, root } = host(); const navigate = vi.fn();
  const transport = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(async () => Response.json({ error: "Billing is unavailable." }, { status: 503 }));
  await act(async () => root.render(createElement(BusinessBillingView, { ...props, transport, navigate })));
  await act(async () => button(node, "Review cancellation").click());
  await act(async () => button(node, "Continue to cancellation").click());
  expect(node.textContent).toContain("Billing is unavailable."); expect(button(node, "Continue to cancellation").disabled).toBe(false);
  transport.mockResolvedValue(Response.json({ portalUrl: "https://foreign.example" }));
  await act(async () => button(node, "Continue to cancellation").click());
  expect(node.textContent).toContain("invalid link"); expect(navigate).not.toHaveBeenCalled();
});
it("aborts a prior workspace's portal request and ignores its late capability", async () => {
  const { node, root } = host(); const navigate = vi.fn(); let resolve!: (value: Response) => void;
  const pending = new Promise<Response>(done => { resolve = done; });
  const transport = vi.fn((_url: string, _init?: RequestInit) => pending);
  await act(async () => root.render(createElement(BusinessBillingView, { ...props, transport, navigate })));
  await act(async () => button(node, "Manage payments and receipts").click());
  expect(button(node, "Review cancellation").disabled).toBe(true);
  await act(async () => root.render(createElement(BusinessBillingView, { ...props, workspaceId: "other", transport, navigate })));
  expect(transport.mock.calls[0]![1]!.signal?.aborted).toBe(true);
  await act(async () => resolve(Response.json({ portalUrl: "https://billing.stripe.com/p/old" })));
  expect(navigate).not.toHaveBeenCalled(); expect(button(node, "Manage payments and receipts").disabled).toBe(false);
});
it.each([null, { futureWork: "paused", providerParticipation: "kept", maintainedResources: { kind: "stopped" }, completedAt: "2026-10-12T12:00:00Z", summary: {}, retainedObligations: [] }])("keeps workspace billing reachable before and after departure", async state => {
  const { node, root } = host(); const request = vi.fn<typeof fetch>(async () => Response.json({ state, successors: [] }));
  await act(async () => root.render(createElement(WorkspaceExit, { workspaceId: "business", request })));
  const link = [...node.querySelectorAll("a")].find(item => item.textContent === "Manage payments or cancel your plan");
  expect(link?.getAttribute("href")).toBe("/workspace/billing?workspaceId=business"); expect(node.innerHTML).not.toContain("/dashboard");
});
