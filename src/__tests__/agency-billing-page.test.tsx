import { isValidElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ list: vi.fn(), business: vi.fn(), agency: vi.fn(), serving: vi.fn(), availability: vi.fn(), invoice: vi.fn() }));
vi.mock("@/platform/workspaces", () => ({ listWorkspaces: mocks.list }));
vi.mock("@/platform/workspaces/http", () => ({ workspaceHttpActor: async () => ({ userId: "owner", verifiedEmail: "owner@example.test" }) }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => true }));
vi.mock("@/platform/business-billing", () => ({ businessBillingEnabled: () => true, readBusinessBilling: mocks.business, readAgencyBilling: mocks.agency }));
vi.mock("@/platform/business-billing/workspace-checkout", () => ({ selfServeBillingConfig: () => ({ enabled: false }) }));
vi.mock("@/platform/agency-directory", () => ({ readBusinessAgencies: mocks.serving }));
vi.mock("@/platform/agency-billing", () => ({ commandAgencyInvoice: mocks.invoice }));
vi.mock("@/platform/connect/checkout-availability", () => ({ readCheckoutAvailability: mocks.availability }));
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
  mocks.list.mockResolvedValue([{ id: "business", kind: "customer", role: "owner", name: "Client business" }, { id: "unrelated-agency", kind: "agency", role: "owner", name: "Owner's other agency" }]);
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
  mocks.list.mockResolvedValue([{ id: "business", kind: "customer", role: "admin", name: "Client business" }]);
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
