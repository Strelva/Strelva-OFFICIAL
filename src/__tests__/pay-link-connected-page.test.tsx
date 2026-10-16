import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), brand: vi.fn(), receipt: vi.fn(), notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }) }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/platform/agency-pay-links/public", () => ({ resolvePublicPayLink: mocks.resolve }));
vi.mock("@/platform/agency-brand/server", () => ({ resolveOwnerBrand: mocks.brand }));
vi.mock("@/platform/agency-pay-links", async () => ({ ...await vi.importActual<typeof import("@/platform/agency-pay-links")>("@/platform/agency-pay-links"), issueAgencyPayLinkReceipt: mocks.receipt }));
vi.mock("@/app/pay/[slug]/PayLinkForm", () => ({ PayLinkForm: () => <form aria-label="Pay this link" /> }));
import PayLinkPage from "@/app/pay/[slug]/page";
import PayLinkReceiptPage from "@/app/pay/[slug]/receipt/page";

const agency = "a2830000-0000-4000-8000-000000000010";
const link = (over: Record<string, unknown> = {}) => ({
  id: "a2830000-0000-4000-8000-000000000012", slug: "harbor-site", rail: "connected_account", agencyWorkspaceId: agency, clientName: "Harbor Dental", description: "Website setup",
  amountCents: 50000, minCents: null, maxCents: null, currency: "usd", createdBy: "secret-creator", revokedBy: "secret-revoker", status: "open", receiptNumber: null, ...over,
});
const props = (payment?: string) => ({ params: Promise.resolve({ slug: "harbor-site" }), searchParams: Promise.resolve({ payment }) });
const render = async (over: Record<string, unknown> = {}, payment?: string) => { mocks.resolve.mockResolvedValue({ kind: "connected", link: link(over) }); return renderToStaticMarkup(await PayLinkPage(props(payment))); };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.brand.mockResolvedValue({ agencyId: agency, name: "North Studio", logoUrl: null, accentColor: "#447a4f", replyTo: null, credit: "runs_on_strelva" });
});

describe("connected pay-link page", () => {
  it("shows the agency, the amount and the form, without the founder's address", async () => {
    const html = await render();
    expect(html).toContain("Pay North Studio"); expect(html).toContain("Harbor Dental"); expect(html).toContain("$500.00");
    expect(html).toContain("Pay this link"); expect(html).toContain("Strelva never holds the money");
    expect(html).not.toContain("Contact Jacob"); expect(html).not.toContain("secret-creator"); expect(html).not.toContain("secret-revoker");
  });
  it("expires without a form", async () => {
    const html = await render({ status: "expired" });
    expect(html).toContain("This link is stopped"); expect(html).not.toContain("Pay this link");
  });
  it("links a paid link to its receipt", async () => {
    const html = await render({ status: "paid", receiptNumber: 1 });
    expect(html).toContain("Paid"); expect(html).toContain("/pay/harbor-site/receipt"); expect(html).not.toContain("Pay this link");
  });
  it("says a returning payer is pending until Stripe confirms, never paid", async () => {
    const html = await render({}, "success");
    expect(html).toContain("says paid once Stripe confirms it"); expect(html).not.toContain("Paid</");
  });
  it("tells a payer who cancelled that nothing was charged", async () => {
    expect(await render({}, "cancelled")).toContain("Nothing was charged");
  });
  it("is not found when the link does not resolve (switch off)", async () => {
    mocks.resolve.mockResolvedValue(null);
    await expect(PayLinkPage(props())).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("payer Payment receipt", () => {
  const doc = { id: "a2830000-0000-4000-8000-000000000099", kind: "payment_receipt", number: 1, issuer_workspace_id: agency, source_id: "a2830000-0000-4000-8000-000000000012", payment_id: "a2830000-0000-4000-8000-000000000011", issued_at: "2026-10-16T00:00:00Z",
    snapshot: { issuerName: "North Studio", billTo: "Harbor Dental", description: "Website setup", amountPaidCents: 50000, currency: "usd", paidAt: "2026-10-16T01:00:00Z", paymentReference: "a2830000-0000-4000-8000-000000000011", createdBy: "secret-creator" } };
  it("shows the numbered receipt and nothing about who created the link", async () => {
    mocks.resolve.mockResolvedValue({ kind: "connected", link: link({ status: "paid" }) });
    mocks.receipt.mockResolvedValue(doc);
    const html = renderToStaticMarkup(await PayLinkReceiptPage({ params: Promise.resolve({ slug: "harbor-site" }) }));
    expect(html).toContain("RCT-000001"); expect(html).toContain("$500.00"); expect(html).toContain("Not emailed"); expect(html).not.toContain("secret-creator");
  });
  it("records no receipt for an unpaid link", async () => {
    mocks.resolve.mockResolvedValue({ kind: "connected", link: link() });
    const html = renderToStaticMarkup(await PayLinkReceiptPage({ params: Promise.resolve({ slug: "harbor-site" }) }));
    expect(html).toContain("No payment is recorded for this link yet."); expect(mocks.receipt).not.toHaveBeenCalled();
  });
  it("is not found when the switch is off", async () => {
    mocks.resolve.mockResolvedValue(null);
    await expect(PayLinkReceiptPage({ params: Promise.resolve({ slug: "harbor-site" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
