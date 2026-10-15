import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const get = vi.hoisted(() => vi.fn());
vi.mock("@/platform/infra/pay-links", async () => ({ ...await vi.importActual<typeof import("@/platform/infra/pay-links")>("@/platform/infra/pay-links"), getRedisPayLink: get, getPayLink: get }));
vi.mock("@/app/pay/[slug]/PayLinkForm", () => ({ PayLinkForm: () => <form aria-label="Pay this link" /> }));
import PayLinkPage, { dynamic, generateMetadata } from "@/app/pay/[slug]/page";
const props = { params: Promise.resolve({ slug: "old-link" }) };
beforeEach(() => { get.mockReset(); });
it("legacy records without agency ownership still render the payment form and existing terms", async () => {
  get.mockResolvedValue({ slug: "old-link", clientName: "Coffee Co", door: "managed_start", minCents: 49900, maxCents: 99900, createdAt: "2026-07-01", createdBy: "old@example.test" });
  const html = renderToStaticMarkup(await PayLinkPage(props));
  expect(html).toContain("Pay this link"); expect(html).toContain("terms agreed directly with you"); expect(html).toContain("Strelva Agency");
  expect(dynamic).toBe("force-dynamic");
});
it("a revoked page clearly expires and exposes no checkout form", async () => {
  get.mockResolvedValue({ slug: "old-link", clientName: "Coffee Co", door: "build", amountCents: 50000, createdAt: "2026-07-01", revokedAt: "2026-10-12", agencyDisplayName: "Recorded Agency" });
  const html = renderToStaticMarkup(await PayLinkPage(props));
  expect(html).toContain("Payment link expired"); expect(html).toContain("Recorded Agency"); expect(html).not.toContain("Pay this link");
  expect((await generateMetadata(props)).title).toEqual({ absolute: "Payment link expired" });
});
it("new links carry their recorded charging agency, without assigning Jacob as actor", async () => {
  get.mockResolvedValue({ slug: "old-link", clientName: "Coffee Co", door: "build", amountCents: 50000, createdAt: "2026-07-01", agencyDisplayName: "Recorded Agency" });
  const html = renderToStaticMarkup(await PayLinkPage(props));
  expect(html).toContain("Recorded Agency"); expect(html).not.toContain("Built by Jacob");
});
