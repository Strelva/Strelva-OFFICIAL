import { expect, it } from "vitest";
import { websiteSchema } from "@/products/websites/contracts";
import { currentWebsiteRecord, websiteMutationAcknowledgement } from "@/experience/websites/contracts";
import { legacyBrief, legacyBrowserRecord, legacyWorkspaceId, legacyWorkId } from "../../tests/support/legacy-website-browser-fixture";

it.each(["approved", "preview_ready", "artifact_failed", "launch_failed"] as const)("legacy browser %s envelope satisfies current native lifecycle", state => {
  const record = legacyBrowserRecord(legacyBrief, 2, state);
  expect(websiteSchema.parse(record.website)).toEqual(record.website);
  expect(currentWebsiteRecord(record, legacyWorkspaceId, legacyWorkId)).toBe(record);
});
it("fictional creation and revision acknowledgements bind the full submitted brief", () => {
  const record = legacyBrowserRecord(legacyBrief, 2, "preview_ready");
  const identity = { workspaceId: legacyWorkspaceId, workId: legacyWorkId, expectedRevision: 1, brief: legacyBrief };
  expect(websiteMutationAcknowledgement(record, "create", identity)).toBe(record);
  expect(websiteMutationAcknowledgement(record, "revise", identity)).toBe(record);
  expect(() => websiteMutationAcknowledgement({ ...record, website: { ...record.website, brief: { ...legacyBrief, notes: "Other brief" } } }, "revise", identity)).toThrow();
});
it("fictional persisted launch failure remains bound to the retained approved candidate", () => {
  const record = legacyBrowserRecord(legacyBrief, 1, "launch_failed");
  const input = { workspaceId: legacyWorkspaceId, workId: legacyWorkId, expectedRevision: 1, candidateRevision: 1, candidateContentHash: "a".repeat(64) };
  expect(websiteMutationAcknowledgement(record, "prepareLaunch", input)).toBe(record);
  expect(() => websiteMutationAcknowledgement(record, "prepareLaunch", { ...input, candidateContentHash: "b".repeat(64) })).toThrow();
});
