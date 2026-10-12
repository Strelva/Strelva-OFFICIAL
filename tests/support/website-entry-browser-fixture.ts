import { routingRecord, draftText } from "./website-routing-browser-fixture";
import { siteDocumentHash } from "../../src/products/websites/site-document";

/** Raw fictional envelopes, parsed by the real default HTTP consumer. */
export function entryProgressRecord(ready: boolean) {
  const record = routingRecord(false);
  return { ...record, rebuild: { ...record.rebuild, revision: ready ? 4 : 3, title: ready ? "Fictional bakery review" : "Fictional bakery", status: ready ? "review_ready" as const : "building" as const, candidate: ready ? record.rebuild.candidate : null } };
}
export function entryPendingRecord(reconciled: boolean) {
  const record = routingRecord();
  if (!reconciled) return record;
  const document = structuredClone(record.rebuild.candidate.document);
  document.siteName = "Fictional bakery current";
  document.facts.ordinary = { ...document.facts.ordinary!, text: draftText };
  return { ...record, rebuild: { ...record.rebuild, revision: 4, title: document.siteName, status: "review_ready" as const, approvedCandidateRevision: null,
    candidate: { ...record.rebuild.candidate, revision: 3, document, contentHash: siteDocumentHash(document) } } };
}
