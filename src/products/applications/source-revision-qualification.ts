import "server-only";
import { applicationSpecSchema } from "./contracts";
import { rehearseCandidate, type ApplicationState } from "./domain";
import { cloneJson } from "@/platform/system-versions/compare";
import type { RevisionRehearsal } from "@/platform/system-versions/qualification";

/** Only the package's data-only native contract is rehearsed here. The empty
 * synthetic record set contains no customer data, creates nothing and calls
 * no provider. This does not establish a client's compatibility or delivery. */
export const rehearseSourceApplicationRevision: RevisionRehearsal = async revision => {
  const { kind, declaration: _declaration, ...definition } = revision.definition;
  if (kind !== "internal_app") throw new Error("This source has no native application rehearsal.");
  const spec = applicationSpecSchema.parse({ ...definition, maintenanceOwner: "qualification-rehearsal" });
  const state: ApplicationState = {
    candidate: { designRevision: 1, specVersion: 1, spec, rehearsal: null },
    versions: [{ version: 1, spec }], releases: [], currentReleaseVersion: null, records: [],
    recordsRevision: 0, status: "draft", history: [], legacyRevision: 0,
  };
  const result = rehearseCandidate(state, { expectedDesignRevision: 1 });
  if (!result.candidate.rehearsal) throw new Error("The native rehearsal returned no witness.");
  return { source: cloneJson(revision.source), definition: cloneJson(revision.definition), requires: cloneJson(revision.requires),
    checks: result.candidate.rehearsal.checks,
    reference: `source-revision:${revision.source.revisionId}:native-data-only-rehearsal-v1` };
};
