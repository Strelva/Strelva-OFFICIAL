import { isValidElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ list: vi.fn(), business: vi.fn(), agency: vi.fn(), serving: vi.fn(), availability: vi.fn(), invoice: vi.fn(), budget: vi.fn(), cap: vi.fn(), checkout: vi.fn() }));
vi.mock("@/platform/workspaces", () => ({ listWorkspaces: mocks.list }));
vi.mock("@/platform/workspaces/http", () => ({ workspaceHttpActor: async () => ({ userId: "owner", verifiedEmail: "owner@example.test" }) }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => true }));
vi.mock("@/platform/business-billing", () => ({ businessBillingEnabled: () => true, readBusinessBilling: mocks.business, readAgencyBilling: mocks.agency }));
vi.mock("@/platform/business-billing/workspace-checkout", () => ({ selfServeBillingConfig: mocks.checkout }));
vi.mock("@/platform/agency-directory", () => ({ readBusinessAgencies: mocks.serving }));
vi.mock("@/platform/agency-billing", () => ({ commandAgencyInvoice: mocks.invoice }));
vi.mock("@/platform/connect/checkout-availability", () => ({ readCheckoutAvailability: mocks.availability }));
vi.mock("@/platform/infra/business-ai-budget", () => ({ readBusinessAiBudget: mocks.budget, businessAiCapUsd: mocks.cap }));
import { BusinessBillingView } from "@/experience/workspace/billing/BusinessBillingView";
import { BusinessAiBudgetSummary, StartWorkspacePlan, WorkspacePlanUnavailable } from "@/experience/workspace/billing/StartWorkspacePlan";
import BillingPage from "@/app/workspace/billing/page";
import { WorkspacePayerTransition } from "@/experience/workspace/WorkspacePayerTransition";
import { AgencyPayerRequests } from "@/experience/workspace/billing/AgencyPayerRequests";
import { AgencyInvoiceAcceptance } from "@/experience/workspace/billing/AgencyInvoiceControls";

function propsFor(node: ReactNode, type: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(node)) return node.map(child => propsFor(child, type)).find(Boolean);
  if (!isValidElement<{ children?: ReactNode }>(node)) return;
  if (node.type === type) return node.props;
  return propsFor(node.props.children, type);
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("STRELVA_CONNECT", "0");
  mocks.list.mockResolvedValue([{ id: "business", kind: "customer", access: "member", role: "owner", name: "Client business" }, { id: "unrelated-agency", kind: "agency", role: "owner", name: "Owner's other agency" }]);
  mocks.checkout.mockReturnValue({ enabled: false }); mocks.budget.mockResolvedValue({ spentUsd: "0.20", reservedUsd: "0.10" }); mocks.cap.mockReturnValue(1);
  mocks.business.mockResolvedValue(null); mocks.agency.mockResolvedValue(null); mocks.availability.mockResolvedValue({ status: "ready" });
  mocks.serving.mockResolvedValue([{ agencyWorkspaceId: "serving-agency", name: "Cedar Studio", seat: true, ofRecord: true, scopes: [] }, { agencyWorkspaceId: "proposed-agency", name: "Waiting Agency", seat: false, ofRecord: false, scopes: [{ status: "proposed" }] }]);
});
afterEach(() => vi.unstubAllEnvs());

it("offers the serving agency even when the client owner has no membership there, excluding unrelated member agencies", async () => {
  const page = await BillingPage({ searchParams: Promise.resolve({ workspaceId: "business" }) });
  expect(propsFor(page, WorkspacePayerTransition)?.agencyChoices).toEqual([{ id: "serving-agency", name: "Cedar Studio" }]);
  expect(mocks.serving).toHaveBeenCalledWith({ userId: "owner", verifiedEmail: "owner@example.test" }, "business");
});
it("fails visibly instead of falling back to member agencies when serving-agency lookup fails", async () => {
  mocks.serving.mockRejectedValueOnce(new Error("offline"));
  const page = await BillingPage({ searchParams: Promise.resolve({ workspaceId: "business" }) });
  expect(propsFor(page, WorkspacePayerTransition)?.agencyChoices).toEqual([]);
  expect(propsFor(page, WorkspacePayerTransition)?.agencyChoicesError).toContain("could not be loaded");
});
it("does not read agency choices for a non-owner", async () => {
  mocks.list.mockResolvedValue([{ id: "business", kind: "customer", access: "member", role: "admin", name: "Client business" }]);
  const page = await BillingPage({ searchParams: Promise.resolve({ workspaceId: "business" }) });
  expect(propsFor(page, WorkspacePayerTransition)?.canPropose).toBe(false); expect(mocks.serving).not.toHaveBeenCalled();
});
it("exposes agency acceptance before an agency billing account exists", async () => {
  mocks.list.mockResolvedValue([{ id: "serving-agency", kind: "agency", role: "owner", name: "Cedar Studio" }]);
  const page = await BillingPage({ searchParams: Promise.resolve({ workspaceId: "serving-agency" }) });
  expect(propsFor(page, AgencyPayerRequests)?.agencyWorkspaceId).toBe("serving-agency"); expect(mocks.business).not.toHaveBeenCalled();
});
it("does not look up a merchant when payments are off", async () => {
  const page = await BillingPage({ searchParams: Promise.resolve({ workspaceId: "business", invoiceId: "invoice" }) });
  expect(propsFor(page, AgencyInvoiceAcceptance)?.checkoutAvailability).toEqual({ status: "coming_soon" });
  expect(mocks.invoice).not.toHaveBeenCalled(); expect(mocks.availability).not.toHaveBeenCalled();
});
it("authorizes the exact invoice before checking its recorded agency's merchant readiness", async () => {
  vi.stubEnv("STRELVA_CONNECT", "1"); mocks.invoice.mockResolvedValue({ business_workspace_id: "business", agency_workspace_id: "serving-agency" });
  const page = await BillingPage({ searchParams: Promise.resolve({ workspaceId: "business", invoiceId: "invoice" }) });
  expect(mocks.invoice).toHaveBeenCalledWith({ userId: "owner", verifiedEmail: "owner@example.test" }, { action: "read", intentId: "invoice" });
  expect(mocks.availability).toHaveBeenCalledWith("serving-agency"); expect(propsFor(page, AgencyInvoiceAcceptance)?.checkoutAvailability).toEqual({ status: "ready" });
});
it("does not read merchant state from a mismatched or unauthorized invoice", async () => {
  vi.stubEnv("STRELVA_CONNECT", "1"); mocks.invoice.mockResolvedValueOnce({ business_workspace_id: "different-business", agency_workspace_id: "other-agency" });
  const page = await BillingPage({ searchParams: Promise.resolve({ workspaceId: "business", invoiceId: "invoice" }) });
  expect(mocks.availability).not.toHaveBeenCalled(); expect(propsFor(page, AgencyInvoiceAcceptance)?.checkoutAvailability).toEqual({ status: "unavailable" });
  mocks.invoice.mockRejectedValueOnce(new Error("denied"));
  const denied = await BillingPage({ searchParams: Promise.resolve({ workspaceId: "business", invoiceId: "invoice" }) });
  expect(mocks.availability).not.toHaveBeenCalled(); expect(propsFor(denied, AgencyInvoiceAcceptance)?.checkoutAvailability).toEqual({ status: "unavailable" });
});

it("supplies exact member-owner billing controls and one real budget summary after billing authorization", async () => {
  vi.stubEnv("STRELVA_BUSINESS_AI_BUDGET", "1");
  const page = await BillingPage({ searchParams: Promise.resolve({ workspaceId: "business" }) });
  expect(propsFor(page, BusinessBillingView)).toMatchObject({ workspaceId: "business", canManage: true });
  expect(propsFor(page, BusinessAiBudgetSummary)).toMatchObject({ budget: { spentUsd: "0.20", reservedUsd: "0.10" }, capUsd: 1, enforced: true });
  expect(propsFor(page, StartWorkspacePlan)).toBeUndefined();
  expect(mocks.budget).toHaveBeenCalledWith("business");
  expect(mocks.business.mock.invocationCallOrder[0]).toBeLessThan(mocks.budget.mock.invocationCallOrder[0]!);
});
it("supplies the usage projection through plan start without duplicating the summary", async () => {
  mocks.checkout.mockReturnValue({ enabled: true });
  const page = await BillingPage({ searchParams: Promise.resolve({ workspaceId: "business" }) });
  expect(propsFor(page, StartWorkspacePlan)).toMatchObject({ workspaceId: "business", budget: { spentUsd: "0.20", reservedUsd: "0.10" }, capUsd: 1, budgetEnforced: false });
  expect(propsFor(page, BusinessAiBudgetSummary)).toBeUndefined();
});
it("keeps the real budget visible for subscribed businesses", async () => {
  mocks.business.mockResolvedValue({ state: "active" }); mocks.checkout.mockReturnValue({ enabled: true });
  const page = await BillingPage({ searchParams: Promise.resolve({ workspaceId: "business" }) });
  expect(propsFor(page, BusinessAiBudgetSummary)?.capUsd).toBe(1); expect(propsFor(page, StartWorkspacePlan)).toBeUndefined();
});
it("does not perform the service-role budget read or grant management for a provider seat, unknown scope, or denied billing", async () => {
  for (const workspaces of [[], [{ id: "business", kind: "customer", access: "provider_seat", role: "owner" }]]) {
    mocks.list.mockResolvedValue(workspaces);
    const page = await BillingPage({ searchParams: Promise.resolve({ workspaceId: "business" }) });
    expect(propsFor(page, BusinessBillingView)?.canManage).toBe(false); expect(propsFor(page, BusinessAiBudgetSummary)).toBeUndefined();
  }
  mocks.business.mockRejectedValueOnce(new Error("denied"));
  await BillingPage({ searchParams: Promise.resolve({ workspaceId: "business" }) });
  expect(mocks.budget).not.toHaveBeenCalled();
});
it("shows unavailable projection after budget or cap failures without breaking authorized billing", async () => {
  mocks.budget.mockRejectedValueOnce(new Error("offline"));
  const failedRead = await BillingPage({ searchParams: Promise.resolve({ workspaceId: "business" }) });
  expect(propsFor(failedRead, BusinessAiBudgetSummary)).toMatchObject({ budget: null, capUsd: null });
  mocks.cap.mockImplementationOnce(() => { throw new Error("invalid cap"); });
  const failedCap = await BillingPage({ searchParams: Promise.resolve({ workspaceId: "business" }) });
  expect(propsFor(failedCap, BusinessAiBudgetSummary)).toMatchObject({ budget: null, capUsd: null });
});

it("offers agency help while the plan is unconfigured, without a checkout control", async () => {
  const page = await BillingPage({ searchParams: Promise.resolve({ workspaceId: "business" }) });
  expect(propsFor(page, WorkspacePlanUnavailable)).toMatchObject({ workspaceId: "business" });
  expect(propsFor(page, StartWorkspacePlan)).toBeUndefined();
});
it("never offers a second plan to an entitled legacy business without a native billing record", async () => {
  mocks.budget.mockResolvedValue({ spentUsd: "0.20", reservedUsd: "0.10", subscribed: true });
  mocks.checkout.mockReturnValue({ enabled: true });
  const page = await BillingPage({ searchParams: Promise.resolve({ workspaceId: "business" }) });
  expect(propsFor(page, WorkspacePlanUnavailable)).toBeUndefined();
  expect(propsFor(page, StartWorkspacePlan)).toBeUndefined();
  expect(propsFor(page, BusinessAiBudgetSummary)).toBeDefined();
});

it("does not offer a potentially duplicate plan while paid entitlement cannot be read", async () => {
  mocks.checkout.mockReturnValue({ enabled: true });
  mocks.budget.mockResolvedValue(null);
  const page = await BillingPage({ searchParams: Promise.resolve({ workspaceId: "business" }) });
  expect(propsFor(page, StartWorkspacePlan)).toBeUndefined();
  expect(propsFor(page, WorkspacePlanUnavailable)).toBeUndefined();
  expect(propsFor(page, BusinessAiBudgetSummary)).toMatchObject({ budget: null });
});
