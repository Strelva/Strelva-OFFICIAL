import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BILLING_AGENCY_ID, BILLING_WORKSPACE_ID, billingFixture } from "./fixtures/business-billing";

const f = vi.hoisted(() => ({ actor: vi.fn(), workspace: vi.fn(), enabled: vi.fn(), read: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not-found"); }, redirect: (location: string) => { throw new Error(`redirect:${location}`); } }));
vi.mock("@/platform/workspaces/http", () => ({ workspaceHttpActor: f.actor }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: f.workspace }));
vi.mock("@/platform/business-billing", () => ({ businessBillingEnabled: f.enabled, readBusinessBilling: f.read }));
import BusinessBillingPage from "@/app/workspace/billing/page";

const actor = { userId: "owner", verifiedEmail: "owner@example.test" };
const render = async (workspaceId = BILLING_WORKSPACE_ID) => renderToStaticMarkup(await BusinessBillingPage({ searchParams: Promise.resolve({ workspaceId }) }));
beforeEach(() => {
  for (const mock of Object.values(f)) mock.mockReset();
  f.workspace.mockReturnValue(true); f.enabled.mockReturnValue(true);
  f.actor.mockResolvedValue(actor); f.read.mockResolvedValue(billingFixture());
});

describe("payer-aware business billing page (#496)", () => {
  it("shows the recorded business payer and preserves existing billing values", async () => {
    const html = await render();
    expect(html).toContain("Business: Maple Street Workshop");
    expect(html).toContain("This business is recorded as the payer.");
    expect(html).toContain("Recorded Strelva amount");
    expect(html).toContain("$185.00 / month");
    expect(html).toContain("Paid through 2026-11-06");
    expect(html).toContain("Payment changes use this business’s existing billing arrangement.");
    expect(html).not.toContain("/dashboard/settings#plan");
    expect(html).toContain(`href="/workspace?workspaceId=${BILLING_WORKSPACE_ID}"`);
    expect(f.read).toHaveBeenCalledExactlyOnceWith(actor, BILLING_WORKSPACE_ID);
    expect(html).not.toContain("Billing contact"); expect(html).not.toContain("billing-recipient@example.test");
  });

  it("names an agency payer without claiming its customer bill or offering business-card settings", async () => {
    f.read.mockResolvedValue(billingFixture({ payerParty: { kind: "agency", workspaceId: BILLING_AGENCY_ID, name: "North Shore Studio" }, paymentStatus: "past_due" }));
    const html = await render();
    expect(html).toContain("Agency: North Shore Studio");
    expect(html).toContain("Any separate bill from the agency follows the agreement with that agency.");
    expect(html).toContain("Payment changes use the agency’s existing billing arrangement.");
    expect(html).toContain("$185.00 / month");
    expect(html).toContain('role="status"'); expect(html).toContain("Sites and inquiry capture keep working.");
    expect(html).not.toContain("Your payment"); expect(html).not.toContain("your amount"); expect(html).not.toContain("plan, card");
    expect(html).not.toContain("/dashboard/settings#plan");
  });

  it.each([undefined, null])("does not infer a missing payer from its recipient (%s)", async (payerParty) => {
    f.read.mockResolvedValue(billingFixture({ payerParty }));
    const html = await render();
    expect(html).toContain("The payer is not recorded in this billing view.");
    expect(html).not.toContain("Business:"); expect(html).not.toContain("Agency:");
    expect(html).not.toContain("Billing contact"); expect(html).not.toContain("/dashboard/settings#plan");
  });

  it.each([null, "   "])("uses only the known party kind when its name is absent (%s)", async (name) => {
    f.read.mockResolvedValue(billingFixture({ payerParty: { kind: "agency", workspaceId: BILLING_AGENCY_ID, name } }));
    const html = await render();
    expect(html).toContain(">Agency</p>"); expect(html).not.toContain("Agency:");
    expect(html).not.toContain(BILLING_AGENCY_ID); expect(html).not.toContain("Billing contact");
  });

  it("escapes a recorded party name as text", async () => {
    f.read.mockResolvedValue(billingFixture({ payerParty: { kind: "agency", workspaceId: BILLING_AGENCY_ID, name: '<script>alert("name")</script>' } }));
    const html = await render();
    expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<script>");
  });

  it("keeps grandfathered terms, shows empty covered sites, and makes no new billing promise", async () => {
    f.read.mockResolvedValue(billingFixture({ state: "grandfathered", grandfatheredTerms: "Existing signed terms remain in force.", sites: [] }));
    const html = await render();
    expect(html).toContain("Existing terms are kept"); expect(html).toContain("Existing signed terms remain in force.");
    expect(html).toContain("No sites are listed on this billing record.");
    expect(html).not.toContain("<form"); expect(html).not.toContain("<button");
  });

  it.each([{ sites: [] }, { sites: [
    { tenantId: "maple-workshop", siteName: "Maple Street Workshop", amountCents: 18500 },
    { tenantId: "maple-store", siteName: "Maple Street Store", amountCents: 9500 },
  ] }])("does not guess a legacy payment-settings destination from covered sites: %j", async ({ sites }) => {
    f.read.mockResolvedValue(billingFixture({ sites }));
    const html = await render();
    expect(html).not.toContain("/dashboard/settings");
    expect(html).not.toContain('href="/client/');
    expect(html).toContain("Payment changes use this business’s existing billing arrangement.");
  });

  it("keeps a missing billing home neutral about who must record it", async () => {
    f.read.mockResolvedValue(null);
    const html = await render();
    expect(html).toContain("The existing agreement and payer need to be recorded.");
    expect(html).not.toContain("Strelva needs to"); expect(html).not.toContain("$0.00");
    expect(html).not.toContain("/dashboard/settings#plan");
  });

  it("shows one safe error for unreadable or denied records without leaking details", async () => {
    f.read.mockRejectedValue(new Error("private agency billing details"));
    const html = await render();
    expect(html).toContain('role="alert"'); expect(html).toContain("Confirm your access and try again.");
    expect(html).toContain("Back to the business");
    expect(html).not.toContain("private agency billing details"); expect(html).not.toContain("Who pays");
  });

  it.each(["workspace", "enabled"] as const)("does not read data with the %s gate off", async (gate) => {
    f[gate].mockReturnValue(false);
    await expect(render()).rejects.toThrow("not-found");
    expect(f.actor).not.toHaveBeenCalled(); expect(f.read).not.toHaveBeenCalled();
  });

  it("requires an authenticated actor before reading billing", async () => {
    f.actor.mockResolvedValue(null);
    await expect(render()).rejects.toThrow("redirect:/sign-in?next=%2Fworkspace");
    expect(f.read).not.toHaveBeenCalled();
  });
});
