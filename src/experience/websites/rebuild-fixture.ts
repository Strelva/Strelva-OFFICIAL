import mooneyEvidence from "./fixtures/mooney-evidence-2026-10-01.json";
import mooneyAudit from "./fixtures/mooney-audit-2026-10-01.json";
import { rebuildAuditSchema } from "./rebuild-transport";
import mooneySource from "./fixtures/mooney-site-2026-10-01.json";
import { siteDocumentSchema } from "@/products/websites/client";
import type { RebuildView } from "./rebuild-transport";
import type { SiteDocument } from "@/products/websites/client";
export const fixtureSiteDocument: SiteDocument = {
  version: 2, siteName: "The Mooney Firm", theme: { palette: "warm", typeScale: "editorial" },
  pages: [{ path: "/", title: "The Mooney Firm", description: "A local interface fixture for website review.", root: "root" }],
  nodes: {
    root: { id: "root", type: "Section", variant: "container", props: {}, children: ["header", "hero", "services", "contact", "footer"], factIds: [] },
    header: { id: "header", type: "Header", variant: "logo-left", props: { brand: "The Mooney Firm", links: [{ label: "Practice areas", href: "/#services" }, { label: "Contact", href: "/#contact" }] }, children: [], factIds: [] },
    hero: { id: "hero", type: "Hero", variant: "statement", props: { eyebrow: "Buffalo, New York · Interface fixture", title: "A clear next step, when the law feels complicated.", body: "Talk through your situation with The Mooney Firm.", cta: { label: "Make an inquiry", href: "/#contact" } }, children: [], factIds: [] },
    services: { id: "services", type: "ServiceGrid", variant: "list", props: { title: "Practice areas", items: [{ title: "[Practice area from source]", body: "The service description is taken from the business's existing site." }] }, children: [], factIds: [] },
    contact: { id: "contact", type: "InquiryForm", variant: "card", props: { title: "Tell us how we can help" }, children: [], factIds: [] },
    footer: { id: "footer", type: "Footer", variant: "simple", props: { text: "The Mooney Firm · Local interface fixture. No inquiry is submitted." }, children: [], factIds: [] },
  },
  facts: {
    sensitive: { text: "[Professional credential listed on the original site]", kind: "credential", highRisk: true, origin: "source", sources: [{ sourceId: "https://attymooney.com/about#fixture", quote: "[Credential sentence from the source. Fixture placeholder; not a verified business claim.]" }], verification: { supported: true, confidence: 0.91 } },
    uncertain: { text: "[Office hours could not be confirmed]", kind: "hours", highRisk: false, origin: "owner_stated", sources: [], verification: { supported: false, confidence: 0.42 } },
  },
  assets: {}, redirects: [], provenance: { sourceUrl: "https://attymooney.com", composer: "rules" },
};
export const mooneyFixtureDocument = siteDocumentSchema.parse(mooneySource);
export function fixtureRebuild(scenario = "review"): RebuildView {
  if (["published", "domain-pending", "domain-verified", "domain-error"].includes(scenario)) {
    const record = fixtureRebuild("review");
    record.title = "[Synthetic business]";
    record.status = "published";
    record.approved = true;
    record.publishedUrl = "https://published-fixture.example.test";
    record.readBack = scenario === "domain-verified" ? "verified" : "failed";
    if (record.candidate) record.candidate.facts = {};
    record.stages = record.stages.map(stage => ({ ...stage, message: "Completed in this local interface fixture" }));
    if (scenario !== "published") record.domain = {
      hostname: "www.domain-fixture.example.test",
      status: scenario === "domain-verified" ? "verified" : scenario === "domain-error" ? "misconfigured" : "pending",
      checkedAt: "2026-10-01T20:43:49.000Z",
      ...(scenario === "domain-error" ? { error: "Synthetic provider error: the CNAME points to an unexpected target. Check the exact records below." } : {}),
      records: [
        { type: "TXT", name: "_verify.domain-fixture.example.test", value: `synthetic-fixture-token-${"0123456789abcdef".repeat(16)}` },
        { type: "CNAME", name: "www.domain-fixture.example.test", value: "synthetic-provider-target-for-rendering-only.example.test" },
      ],
    };
    return record;
  }
  if (scenario === "mooney") return {
    ...fixtureRebuild("review"), audit: rebuildAuditSchema.parse(mooneyAudit),
    stages: [{ stage: "Read website", status: "completed", message: `${mooneyEvidence.pages} public pages read on October 1` }, { stage: "Extract facts", status: "completed", message: `${Object.keys(mooneyFixtureDocument.facts).length} facts retain source quotes` }, { stage: "Compose pages", status: "completed", message: "Private catalog preview from public source content" }, { stage: "Check facts", status: "completed", message: `${mooneyEvidence.needsReview} decisions flagged; source support does not independently verify claims` }],
    candidate: { revision: 1, contentHash: mooneyEvidence.documentHash, previewHref: "/preview/strelva/rebuild/site?example=mooney", pageCount: mooneyFixtureDocument.pages.length, hasForms: false, facts: structuredClone(mooneyFixtureDocument.facts), unmappedPages: [] },
  };
  return { workId: "44444444-4444-4444-8444-444444444444", workspaceId: "11111111-1111-4111-8111-111111111111", revision: 1, title: "The Mooney Firm", status: scenario === "building" ? "building" : scenario === "failed" ? "failed" : "review", stages: [
    { stage: "Read website", status: "completed", message: "Source pages saved in this interface fixture" },
    { stage: "Extract facts", status: "completed", message: "Business details keep their source quotes" },
    { stage: "Compose pages", status: scenario === "building" ? "running" : "completed", message: scenario === "building" ? "Composing the saved content" : "Private preview prepared" },
    { stage: "Check facts", status: scenario === "failed" ? "failed" : scenario === "building" ? "pending" : "completed", message: scenario === "failed" ? "Verification unavailable; earlier stages retained" : "Two fixture decisions require owner review" },
  ], candidate: scenario === "building" ? null : { revision: 1, contentHash: "a".repeat(64), previewHref: "/preview/strelva/rebuild/site", pageCount: 1, hasForms: false, facts: structuredClone(fixtureSiteDocument.facts), unmappedPages: [] }, capabilitySelection: null, audit: null, documentRevisions: [], history: [], approved: false, publishedUrl: null, readBack: null, domain: null, error: scenario === "failed" ? "Fact verification failed. Retry resumes from the saved composition." : null };
}
