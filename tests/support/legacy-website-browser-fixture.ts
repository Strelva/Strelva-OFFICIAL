import type { WebsiteBrief, WebsiteRecord } from "../../src/products/websites/contracts";

export const legacyWorkspaceId = "11111111-1111-4111-8111-111111111111";
export const legacyWorkId = "44444444-4444-4444-8444-444444444444";
export const legacyBrief: WebsiteBrief = { businessName: "Fictional bakery", description: "Fictional bakery serving pickup orders.", audience: "Local neighbors", primaryGoal: "Arrange pickup", primaryCallToAction: "Request pickup", contactEmail: "pickup@example.test", notes: "Fictional notes retained with this brief." };
const at = "2026-10-09T00:00:00Z";

export function legacyBrowserRecord(brief: WebsiteBrief = legacyBrief, revision = 1, state: "approved" | "preview_ready" | "artifact_failed" | "launch_failed" = "approved"): WebsiteRecord {
  const failed = state.endsWith("failed");
  const artifactFailed = state === "artifact_failed";
  const approved = state === "approved" || state === "launch_failed";
  const hash = "a".repeat(64);
  const candidate = artifactFailed ? null : { kind: "website_candidate" as const, revision, spec: { version: 1 as const, siteName: brief.businessName, content: { hero: { headline: brief.businessName } }, pages: { home: { sections: [{ type: "hero", visible: true, order: 0, props: { headline: brief.businessName } }] } }, theme: { fontDisplay: "Instrument_Serif", fontBody: "Inter" } }, contentHash: hash, rendererDigest: "b".repeat(64), artifactDigest: "c".repeat(64), preview: { href: `/api/websites/${legacyWorkId}/preview`, revision, contentHash: hash }, generatedAt: at };
  return { workId: legacyWorkId, workspaceId: legacyWorkspaceId, createdAt: at, updatedAt: at, website: { version: 1, revision, title: brief.businessName, brief: structuredClone(brief), status: failed ? "failed" : approved ? "approved" : "preview_ready", candidate, approvedCandidateRevision: approved ? revision : null, launch: state === "launch_failed" ? { status: "failed", candidateRevision: revision, receipt: null, failure: "Fictional launch preparation failed after saving." } : { status: "not_requested", candidateRevision: null, receipt: null, failure: null }, lastError: failed ? { stage: artifactFailed ? "artifact" : "launch", message: artifactFailed ? "Fictional preview generation failed after saving the brief." : "Fictional launch preparation failed after saving.", at } : null, createdBy: "fictional-owner", createdAt: at, history: [] } };
}
