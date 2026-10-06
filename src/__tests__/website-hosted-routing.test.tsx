import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { siteDocumentHash, siteDocumentSchema, type SiteDocument } from "@/products/websites/site-document";
import { bindToCurrentTenant, currentHostedUrl } from "@/products/websites/hosted-routing";

vi.mock("@/lib/redis", () => ({ getRedis: () => null }));
const published = vi.hoisted(() => ({ row: null as null | Record<string, unknown> }));
vi.mock("@/lib/db/client", () => ({ getSupabase: () => ({ rpc: async () => ({ data: published.row ? [published.row] : [], error: null }) }) }));
vi.mock("@/products/websites/rebuild-release", () => ({ websiteRebuildReleaseEnabled: () => true }));

// Audit 2026-10-05, P2 #8: after a hosted tenant rename, forms, reports and
// health keep working; issued receipts and the stored document never change.

function documentBoundTo(tenant: string): SiteDocument {
  return siteDocumentSchema.parse({
    version: 2, siteName: "Renamed fictional site", theme: { palette: "light", typeScale: "standard" },
    pages: [{ path: "/", title: "Home", description: "A fictional site.", root: "root" }],
    nodes: { root: { id: "root", type: "Section", variant: "container", props: {}, children: ["form"] }, form: { id: "form", type: "InquiryForm", variant: "card", props: { title: "Send an inquiry" } } },
    assets: {}, facts: {}, redirects: [], provenance: { composer: "rules" },
    capabilities: { baseUrl: "https://app.strelva.com", tenant, inquiry: { capabilityId: "contact", version: 1 } },
  });
}

describe("hosted routing after a tenant rename", () => {
  const issued = { providerUrl: "https://old-slug.strelva.com/" };
  it("binds visitor tools to the current slug only when the receipt proves the old binding was this tenant", () => {
    const document = documentBoundTo("old-slug");
    expect(bindToCurrentTenant(document, "new-slug", issued, "strelva.com").capabilities?.tenant).toBe("new-slug");
    // The stored document is never mutated.
    expect(document.capabilities?.tenant).toBe("old-slug");
    // A binding that names some other tenant stays disabled.
    expect(bindToCurrentTenant(documentBoundTo("someone-else"), "new-slug", issued, "strelva.com").capabilities?.tenant).toBe("someone-else");
    // No receipt, or a receipt for another host: nothing is rebound.
    expect(bindToCurrentTenant(document, "new-slug", undefined, "strelva.com").capabilities?.tenant).toBe("old-slug");
    expect(bindToCurrentTenant(document, "new-slug", { providerUrl: "https://old-slug.example.test/" }, "strelva.com").capabilities?.tenant).toBe("old-slug");
    expect(bindToCurrentTenant(documentBoundTo("new-slug"), "new-slug", issued, "strelva.com")).toEqual(documentBoundTo("new-slug"));
  });
  it("reads the site back at the current slug, keeping the receipt URL until a rename", () => {
    expect(currentHostedUrl({ tenantId: "old-slug", receipt: issued }, "strelva.com")).toBe("https://old-slug.strelva.com/");
    expect(currentHostedUrl({ tenantId: "new-slug", receipt: issued }, "strelva.com")).toBe("https://new-slug.strelva.com/");
    expect(currentHostedUrl({ tenantId: "new-slug" }, "strelva.com")).toBe("https://new-slug.strelva.com/");
  });
  it("serves the form under the current slug while the page still reports the issued hash", async () => {
    const { SiteRenderer } = await import("@/products/websites/SiteRenderer");
    const document = documentBoundTo("old-slug");
    const hash = siteDocumentHash(document);
    const stale = renderToStaticMarkup(<SiteRenderer document={document} tenant="new-slug" />);
    expect(stale).toContain("Strelva helps this business handle your request.");
    const served = renderToStaticMarkup(<SiteRenderer document={document} tenant="new-slug" capabilityTenant="new-slug" contentHash={hash} />);
    expect(served).not.toContain("Strelva helps this business handle your request.");
    expect(served).toContain(`name="strelva-site-hash" content="${hash}"`);
    // A capability tenant that is not the serving tenant is ignored.
    expect(renderToStaticMarkup(<SiteRenderer document={document} tenant="new-slug" capabilityTenant="elsewhere" />)).toContain("Strelva helps this business handle your request.");
  });
  it("derives the capability tenant from the publication's own receipt", async () => {
    const { publishedCapabilityTenant } = await import("@/products/websites/document-store");
    const document = documentBoundTo("old-slug");
    published.row = { workspace_id: "73000000-0000-4000-8000-000000000001", website_work_id: "73000000-0000-4000-8000-000000000002", revision: 1, content_hash: siteDocumentHash(document), document, created_by: "73000000-0000-4000-8000-000000000003", created_at: "2026-10-08T00:00:00Z", tenant_id: "new-slug",
      receipt: { status: "published", provider: "strelva-hosted", providerUrl: "https://old-slug.strelva.com/", receiptId: "fixture-receipt", artifactHash: siteDocumentHash(document), candidateRevision: 1, publishedAt: "2026-10-08T00:00:00Z", evidence: "Fixture" } };
    expect(await publishedCapabilityTenant("new-slug", document)).toBe("new-slug");
    expect(await publishedCapabilityTenant("old-slug", document)).toBeUndefined();
    published.row = { ...published.row, receipt: { ...(published.row.receipt as object), providerUrl: "https://another.strelva.com/" } };
    expect(await publishedCapabilityTenant("new-slug", document)).toBeUndefined();
    published.row = null;
    expect(await publishedCapabilityTenant("new-slug", document)).toBeUndefined();
  });
});
