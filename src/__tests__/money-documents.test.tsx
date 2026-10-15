import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({ actor: vi.fn(), agency: vi.fn(), records: vi.fn(), document: vi.fn(), receipt: vi.fn(), brand: vi.fn(), release: vi.fn(), notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }), redirect: vi.fn(() => { throw new Error("NEXT_REDIRECT"); }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "app.example" }) }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: mocks.release }));
vi.mock("@/platform/workspaces/http", () => ({ workspaceHttpActor: mocks.actor }));
vi.mock("@/experience/workspace/billing/payment-links-server", () => ({ paymentLinkAgency: mocks.agency }));
vi.mock("@/platform/agency-brand/server", () => ({ resolveOwnerBrand: mocks.brand }));
vi.mock("@/experience/app-frame/StrelvaShell", () => ({ StrelvaShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/platform/agency-pay-links", async () => ({ ...await vi.importActual<typeof import("@/platform/agency-pay-links")>("@/platform/agency-pay-links"), readAgencyPayLinkRecords: mocks.records, readMoneyDocument: mocks.document, issueAgencyPayLinkReceipt: mocks.receipt }));
import { MoneyDocument } from "@/experience/workspace/billing/MoneyDocument";
import InvoicePage from "@/app/workspace/payment-links/[linkId]/invoice/page";
import ReceiptPage from "@/app/workspace/payment-links/[linkId]/receipt/page";

const agency = "a2830000-0000-4000-8000-000000000010";
const linkId = "a2830000-0000-4000-8000-000000000012";
const doc = (kind: "invoice" | "payment_receipt", number: number) => ({ id: "a2830000-0000-4000-8000-000000000099", kind, number, issuer_workspace_id: agency, source_id: linkId, payment_id: kind === "invoice" ? null : agency, issued_at: "2026-10-16T00:00:00Z",
  snapshot: { issuerName: "North Studio", billTo: "Harbor Dental", description: "Website setup", amountCents: 125050, currency: "usd", amountPaidCents: 125050, paidAt: "2026-10-17T00:00:00Z", paymentReference: "pay-ref-1", issuedAt: "2026-10-16T00:00:00Z" } });
const link = (over: Record<string, unknown> = {}) => ({ id: linkId, slug: "harbor-site", rail: "connected_account", status: "open", ...over });
const props = (id = linkId) => ({ params: Promise.resolve({ linkId: id }), searchParams: Promise.resolve({ workspaceId: agency }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", ""); vi.stubEnv("STRELVA_AGENCY_PAY_LINKS", "1"); vi.stubEnv("STRELVA_CONNECT", "1"); vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
  mocks.release.mockReturnValue(true); mocks.actor.mockResolvedValue({ userId: "u", verifiedEmail: "o@example.test" });
  mocks.agency.mockResolvedValue({ id: agency, role: "owner" }); mocks.records.mockResolvedValue([link()]);
  mocks.brand.mockResolvedValue({ agencyId: agency, name: "North Studio" });
});

describe("MoneyDocument", () => {
  it("numbers an Invoice, formats the amount and says it is not emailed", () => {
    const html = renderToStaticMarkup(<MoneyDocument doc={doc("invoice", 12)} payUrl="https://app.example/pay/harbor-site" />);
    expect(html).toContain("INV-000012"); expect(html).toContain("$1,250.50"); expect(html).toContain("Not emailed"); expect(html).toContain("https://app.example/pay/harbor-site");
    expect(html).toContain("Strelva never holds the money"); expect(html).not.toMatch(/Strelva (is|as) (the )?merchant/i);
  });
  it("numbers a Payment receipt with its reference", () => {
    const html = renderToStaticMarkup(<MoneyDocument doc={doc("payment_receipt", 3)} />);
    expect(html).toContain("RCT-000003"); expect(html).toContain("Payment reference"); expect(html).toContain("pay-ref-1"); expect(html).toContain("Payment receipt");
  });
  it("hides the page chrome and the print button when printed", () => {
    const html = renderToStaticMarkup(<MoneyDocument doc={doc("invoice", 1)} />);
    expect(html).toContain("@media print"); expect(html).toContain("data-print-hide");
  });
});

describe("agency document pages", () => {
  it("are not found while the switch is off", async () => {
    vi.stubEnv("STRELVA_AGENCY_PAY_LINKS", "");
    await expect(InvoicePage(props())).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.records).not.toHaveBeenCalled();
  });
  it("do not show another agency's link", async () => {
    mocks.records.mockResolvedValue([]);
    await expect(InvoicePage(props("a2830000-0000-4000-8000-0000000000ff"))).rejects.toThrow("NEXT_NOT_FOUND");
  });
  it("show the numbered Invoice", async () => {
    mocks.document.mockResolvedValue(doc("invoice", 1));
    const html = renderToStaticMarkup(await InvoicePage(props()));
    expect(html).toContain("INV-000001"); expect(html).toContain("https://app.example/pay/harbor-site");
  });
  it("tell an unpaid link's receipt page that no payment is recorded, without issuing one", async () => {
    const html = renderToStaticMarkup(await ReceiptPage(props()));
    expect(html).toContain("No payment is recorded for this link yet"); expect(mocks.receipt).not.toHaveBeenCalled();
  });
  it("issue the Payment receipt once the link is paid", async () => {
    mocks.records.mockResolvedValue([link({ status: "paid" })]); mocks.receipt.mockResolvedValue(doc("payment_receipt", 1));
    const html = renderToStaticMarkup(await ReceiptPage(props()));
    expect(html).toContain("RCT-000001"); expect(mocks.receipt).toHaveBeenCalledWith(linkId);
  });
});
