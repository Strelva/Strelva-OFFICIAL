import { applicationSpecSchema } from "./contracts";
import { rehearseCandidate, publishCandidate, applyLegacyApplicationCommand, type ApplicationState } from "./domain";
import type { JsonObject, PackageRehearsalReceipt } from "@/platform/system-versions";

/** Exercise the actual pure native runtime with synthetic records. No store,
 * grants, account lookup or provider adapter is reachable from this rehearsal. */
export function rehearseApplicationPackage(revisionId: string, definition: JsonObject): PackageRehearsalReceipt {
  const { kind, ...raw } = definition;
  if (kind !== "internal_app") throw new Error("This rehearsal only supports native internal applications.");
  const spec = applicationSpecSchema.parse({ ...raw, maintenanceOwner: "package-rehearsal" });
  const values = Object.fromEntries(spec.fields.map(field => [field.id, field.type === "number" ? 1 : field.type === "boolean" ? true : field.type === "date" ? "2026-10-07" : field.type === "contact" || field.type === "assigned_person" ? "aaaaaaaa-0000-4000-8000-000000000001" : field.type === "select" ? field.options[0]! : "Synthetic rehearsal record"]));
  const initial: ApplicationState = { candidate: { designRevision: 0, specVersion: 1, spec, rehearsal: null }, versions: [{ version: 1, spec }], releases: [], currentReleaseVersion: null, records: [], recordsRevision: 0, status: "draft", history: [], legacyRevision: 0 };
  const rehearsed = rehearseCandidate(initial, { expectedDesignRevision: 0 });
  const checks = [...rehearsed.candidate.rehearsal!.checks];
  const published = publishCandidate(rehearsed, { expectedCandidateRevision: 0, expectedReleaseVersion: null }, { at: "2026-10-07T00:00:00.000Z", by: "package-rehearsal" });
  const submitted = applyLegacyApplicationCommand(published, { kind: "submit", record: { id: "synthetic", values } }, "package-rehearsal", "2026-10-07T00:00:00.000Z");
  checks.push({ name: "Isolated native publication and record submission", passed: submitted.records.length === 1 });
  let rejected = false;
  try { applyLegacyApplicationCommand(published, { kind: "submit", record: { id: "invalid", values: { unknown_rehearsal_field: "Rejected" } } }, "package-rehearsal", "2026-10-07T00:00:00.000Z"); } catch { rejected = true; }
  checks.push({ name: "Native runtime rejects undeclared record fields", passed: rejected });
  return { revisionId, checks, reference: `Native application domain rehearsal for ${revisionId}: schema, executable rejection, synthetic publish/submit, invalid-record rejection; no real business records or provider effects.` };
}
