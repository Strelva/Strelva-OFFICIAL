import { fixtureSiteDocument } from "../../src/experience/websites/rebuild-fixture";
import { siteDocumentHash } from "../../src/products/websites/site-document";

export const workspaceId = "11111111-1111-4111-8111-111111111111";
export const workId = "44444444-4444-4444-8444-444444444444";
export const actorId = "22222222-2222-4222-8222-222222222222";
export const at = "2026-10-09T00:00:00Z";
export const factText = "Fictional bakery prepares bread for Buffalo families.";
export const draftText = "Fictional bakery prepares bread and pastries for Buffalo families.";
export const routingOptions = { tenants: [{ tenantId: "fictional-bakery", siteName: "Fictional bakery", inquiry: [{ capabilityId: "orders", version: 1, name: "Order requests" }, { capabilityId: "catering", version: 1, name: "Catering requests" }], booking: [] }] };

export function routingRecord(published = true) {
  const document = structuredClone(fixtureSiteDocument);
  document.siteName = "Fictional bakery";
  document.facts = { ordinary: { text: factText, kind: "claim", highRisk: false, origin: "owner_confirmed", sources: [], verification: { supported: true, confidence: 1 } } };
  document.capabilities = { baseUrl: "https://app.example.test", tenant: "fictional-bakery", inquiry: { capabilityId: "orders", version: 1 } };
  const contentHash = siteDocumentHash(document);
  return { workId, workspaceId, rebuild: { version: 2, revision: 3, title: "Fictional bakery", input: { requestId: "routing-browser-fixture", businessName: "Fictional bakery", description: "Fictional routing recovery only." }, status: published ? "published" : "review_ready", stages: [], checkpoint: null, candidate: { revision: 2, contentHash, document, previewHref: `/api/websites/${workId}/preview` }, approvedCandidateRevision: published ? 2 : null, publishedCapabilitySelection: { tenantId: "fictional-bakery", inquiryCapabilityId: "orders" }, tenantId: "fictional-bakery", launch: { receipt: published ? { status: "published", receiptId: "fictional-publication", provider: "fictional", providerUrl: "https://published.example.test", evidence: "Fictional historical publication; no external execution.", artifactHash: contentHash, candidateRevision: 2, publishedAt: at } : null, readBack: published ? { status: "verified", checkedAt: at, message: "Fictional historical readback." } : null }, lastError: null, createdBy: actorId, createdAt: at, history: [{ revision: 2, kind: "published", actorId, at }] } };
}

export function domainReceipt(requestId: string, hostname: string) {
  return { id: requestId, workspaceId, workId, tenantId: "fictional-bakery", publishedRevision: 2, publishedHash: routingRecord().rebuild.candidate.contentHash, hostname, records: [{ type: "TXT", name: `_verify.${hostname}`, value: "fictional-render-only" }], revisionHash: "b".repeat(64), createdAt: at, expiresAt: "2030-10-09T00:00:00Z", current: true, decisionId: null, result: null, receiptEmail: { status: "suppressed", reason: "fictional-ui-proof" } };
}

export function undoReceipt(command: { commandId: string; tenantId: string; candidateRevision: number; candidateContentHash: string }) {
  return { receiptId: command.commandId, kind: "rebuild_cutover_undone", tenantId: command.tenantId, tenantStableId: "33333333-3333-4333-8333-333333333333", workId, revision: command.candidateRevision, contentHash: command.candidateContentHash, restoredBy: actorId, restoredAt: at, deliveryModel: "custom_repo", domainRestored: true, fallbackVerified: true };
}
