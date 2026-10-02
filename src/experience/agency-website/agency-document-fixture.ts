import type { AgencyDocumentState } from "./AgencyWebsiteDocumentDraftExperience";
import { fixtureSiteDocument } from "@/experience/websites/rebuild-fixture";
import { websiteRebuildSchema } from "@/products/websites/client";

export function agencyDocumentFixture(scenario = "agency-active"): AgencyDocumentState {
  const id = "11111111-1111-4111-8111-111111111111";
  const document = structuredClone(fixtureSiteDocument);
  document.nodes.services!.children = ["service-one", "service-two"];
  for (const [nodeId,title] of [["service-one","[First service from source]"],["service-two","[Second service from source]"]]) document.nodes[nodeId!] = { id: nodeId!, type: "ServiceDetail", variant: "standard", props: { title: title!, body: "[Service details from the source]" }, children: [], factIds: [] };
  document.pages.push({ path: "/service-one", title: "[First service page]", description: "Local agency fixture detail page", root: "service-one" });
  const at = "2026-10-01T20:00:00.000Z";
  return {
    grant: scenario === "agency-no-permission" ? null : { id, managedWebsiteBindingId: id, businessWorkspaceId: id, tenantId: "fixture", deliveryId: id, assignmentId: id, agencyWorkspaceId: id, operatorUserId: id, grantedBy: id, status: scenario === "agency-revoked" ? "revoked" : "active", expiresAt: scenario === "agency-expired" ? "2000-01-01T00:00:00.000Z" : "2099-01-01T00:00:00.000Z", createdAt: at, updatedAt: at, revokedAt: scenario === "agency-revoked" ? at : null, revokedBy: scenario === "agency-revoked" ? id : null },
    website: { workId: id, workspaceId: id, rebuild: websiteRebuildSchema.parse({ version: 2, revision: 1, title: "[Synthetic client website]", input: { requestId: "agency-fixture", url: "https://fixture.example.test" }, status: "review_ready", stages: [], checkpoint: null, candidate: { revision: 1, contentHash: "a".repeat(64), document, previewHref: `/api/websites/${id}/preview` }, approvedCandidateRevision: null, tenantId: "fixture", launch: { receipt: null, readBack: null }, lastError: null, createdBy: id, createdAt: at, history: [] }) },
    section: "services", sections: ["services"],
  };
}
