import { fixtureSiteDocument } from "../../src/experience/websites/rebuild-fixture";
import { siteDocumentHash } from "../../src/products/websites/site-document";

export const workspaceId = "11111111-1111-4111-8111-111111111111";
export const workId = "44444444-4444-4444-8444-444444444444";
const at = "2026-10-09T00:00:00Z";
export const formOptions = { tenants: [{ tenantId: "fictional-bakery", siteName: "Fictional bakery", inquiry: [{ capabilityId: "orders", version: 1, name: "Order requests" }, { capabilityId: "catering", version: 2, name: "Catering requests" }], booking: [] }] };

export function formsRecord(version: 1 | 2, revision = 1, approved = true) {
  const selection = { tenantId: "fictional-bakery", inquiryCapabilityId: revision === 1 ? "orders" : "catering" };
  if (version === 2) {
    const document = structuredClone(fixtureSiteDocument);
    document.siteName = "Fictional bakery"; document.facts = {};
    document.capabilities = { baseUrl: "https://app.example.test", tenant: selection.tenantId, inquiry: { capabilityId: selection.inquiryCapabilityId, version: revision } };
    return { workId, workspaceId, rebuild: { version: 2, revision, title: "Fictional bakery", input: { requestId: "forms-browser-fixture", businessName: "Fictional bakery", description: "Fictional forms recovery only." }, status: approved ? "approved" : "review_ready", stages: [], checkpoint: null, candidate: { revision, contentHash: siteDocumentHash(document), document, previewHref: `/api/websites/${workId}/preview` }, approvedCandidateRevision: approved ? revision : null, publishedCapabilitySelection: selection, tenantId: selection.tenantId, launch: { receipt: null, readBack: null }, lastError: null, createdBy: "fictional-owner", createdAt: at, history: [] } };
  }
  const contentHash = "a".repeat(64);
  const artifact = { kind: "website_candidate", revision, spec: { version: 1, siteName: "Fictional bakery", content: { hero: { headline: "Fictional bakery" } }, pages: { home: { sections: [{ type: "hero", visible: true, order: 0, props: { headline: "Fictional bakery" } }] } }, theme: { fontDisplay: "Instrument_Serif", fontBody: "Inter" } }, contentHash, rendererDigest: "b".repeat(64), artifactDigest: "c".repeat(64), preview: { href: `/api/websites/${workId}/preview`, revision, contentHash }, generatedAt: at };
  return { workId, workspaceId, createdAt: at, updatedAt: at, website: { version: 1, revision, title: "Fictional bakery", brief: { businessName: "Fictional bakery", description: "Fictional forms recovery only.", primaryCallToAction: "Contact us" }, status: approved ? "approved" : "preview_ready", candidate: artifact, approvedCandidateRevision: approved ? revision : null, publishedCapabilitySelection: selection, launch: { status: "not_requested", candidateRevision: null, receipt: null, failure: null }, lastError: null, createdBy: "fictional-owner", createdAt: at, history: [] } };
}
