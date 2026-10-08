import { z } from "zod";
import { qualificationEvidenceSchema } from "@/platform/capabilities/contracts";
import { assertShareableDefinition, changedPaths, cloneJson, jsonEqual, type JsonObject } from "./compare";
import { assertDeclaredPackageBehavior } from "./declarations";
import type { SourceRevision } from "./types";
import { VersionStaleError, VersionValidationError } from "./types";

export const revisionQualificationRefSchema = z.object({
  businessId: z.string().uuid(), systemId: z.string().uuid(), revisionId: z.string().uuid(), number: z.number().int().positive(),
}).strict();
export const REVISION_QUALIFICATION_CHECKS = ["shareable_definition", "declaration_match", "rehearsal", "prior_revision_compare"] as const;
export const revisionQualificationEvidenceSchema = qualificationEvidenceSchema
  .omit({ capabilityId: true, capabilityVersion: true })
  .extend({ source: revisionQualificationRefSchema, check: z.enum(REVISION_QUALIFICATION_CHECKS),
    environment: z.literal("local"), kind: z.enum(["focused_test", "integration_test"]) }).strict();
export type RevisionQualificationEvidence = z.infer<typeof revisionQualificationEvidenceSchema>;

/** Preparatory evidence only. #323 must select human reviewers and the bar
 * before any human verdict or qualified state can be represented or written. */
export const revisionQualificationSchema = z.object({
  id: z.string().uuid(), schemaVersion: z.literal(1), source: revisionQualificationRefSchema,
  previousRevisionId: z.string().uuid().nullable(),
  comparedPaths: z.array(z.string().min(1).max(300)).max(10_000),
  automatedStatus: z.enum(["passed", "failed"]),
  humanReview: z.object({ status: z.literal("pending"), reason: z.literal("review_policy_pending") }).strict(),
  evidence: z.array(revisionQualificationEvidenceSchema).length(4),
  evaluatedBy: z.string().uuid(), evaluatedAt: z.string().datetime({ offset: true }),
}).strict().superRefine((record, ctx) => {
  const valid = new Set(record.evidence.map(item => item.check)).size === REVISION_QUALIFICATION_CHECKS.length
    && record.evidence.every(item => sameQualificationRevision(item.source, record.source)
      && item.id === `source_revision.${item.check}` && item.checkedAt === record.evaluatedAt
      && item.kind === (item.check === "rehearsal" ? "integration_test" : "focused_test"))
    && record.automatedStatus === (record.evidence.every(item => item.status === "passed") ? "passed" : "failed")
    && (record.source.number === 1 ? record.previousRevisionId === null : record.previousRevisionId !== null)
    && record.previousRevisionId !== record.source.revisionId;
  if (!valid) ctx.addIssue({ code: "custom", message: "Qualification evidence is incomplete or belongs to another source revision." });
});
export type RevisionQualification = z.infer<typeof revisionQualificationSchema>;
export type QualificationRevisionRef = z.infer<typeof revisionQualificationRefSchema>;

export function sameQualificationRevision(left: QualificationRevisionRef, right: QualificationRevisionRef): boolean {
  return left.businessId === right.businessId && left.systemId === right.systemId
    && left.revisionId === right.revisionId && left.number === right.number;
}

/** Supplied by the trusted product adapter, never by a browser/request body.
 * Its complete input snapshot prevents reuse after a definition/requirement
 * change, even if an in-memory adapter mistakenly reused an identifier. */
export interface RevisionRehearsalWitness {
  source: QualificationRevisionRef;
  definition: JsonObject;
  requires: { bindingKinds: string[] };
  checks: Array<{ name: string; passed: boolean }>;
  reference: string;
}
export type RevisionRehearsal = (revision: SourceRevision) => Promise<RevisionRehearsalWitness>;

export async function assessRevisionQualification(input: {
  revision: SourceRevision; previous: SourceRevision | null; rehearse: RevisionRehearsal;
  id: string; evaluatedBy: string; evaluatedAt: string;
  environment: "local";
}): Promise<RevisionQualification> {
  // Clone before handing a snapshot to an adapter. No caller may mutate the
  // identity or definition while checks are running.
  const revision = cloneJson(input.revision);
  const source = revisionQualificationRefSchema.parse(revision.source);
  const previous = input.previous ? cloneJson(input.previous) : null;
  if (source.number === 1 ? previous !== null : (!previous || previous.source.businessId !== source.businessId
    || previous.source.systemId !== source.systemId || previous.source.number !== source.number - 1
    || previous.source.revisionId === source.revisionId)) {
    throw new VersionStaleError("The exact prior source revision is required for comparison.");
  }
  const evidence: RevisionQualificationEvidence[] = [];
  const recordCheck = (check: typeof REVISION_QUALIFICATION_CHECKS[number], passed: boolean, summary: string, reference?: string) => {
    evidence.push(revisionQualificationEvidenceSchema.parse({
      id: `source_revision.${check}`, source, check, kind: check === "rehearsal" ? "integration_test" : "focused_test",
      environment: input.environment, status: passed ? "passed" : "failed",
      reference: reference ?? `source-revision:${source.revisionId}:${check}`, checkedAt: input.evaluatedAt, summary,
    }));
  };
  let shareable = true;
  try { assertShareableDefinition(revision.definition); } catch { shareable = false; }
  recordCheck("shareable_definition", shareable, shareable ? "Shareable definition lint passed." : "Shareable definition lint failed.");
  let declared = true;
  try { assertDeclaredPackageBehavior(revision.definition, revision.definition.declaration, revision.requires.bindingKinds); } catch { declared = false; }
  recordCheck("declaration_match", declared, declared ? "Inspected behavior fits this immutable revision's declaration." : "The supported behavior and revision declaration do not match.");
  if (!shareable || !declared) {
    recordCheck("rehearsal", false, "Rehearsal was not run because prerequisite checks failed.");
  } else {
    let witness: RevisionRehearsalWitness | null = null;
    try { witness = await input.rehearse(cloneJson(revision)); } catch {
      // Provider errors may contain private data. Retain a bounded failure,
      // never a caller-supplied success or an unfiltered exception message.
    }
    if (witness && (!sameQualificationRevision(witness.source, source)
      || !jsonEqual(witness.definition, revision.definition) || !jsonEqual(witness.requires, revision.requires))) {
      throw new VersionStaleError("The rehearsal belongs to another source revision or definition.");
    }
    const passed = Boolean(witness && witness.checks.length && witness.checks.every(check => check.passed === true));
    recordCheck("rehearsal", passed, passed
      ? "Native data-only rehearsal passed for the pinned definition. Customer records and outside delivery were not exercised."
      : "Native data-only rehearsal failed or is unavailable.", witness?.reference);
  }
  // Comparing is evidence that changes were enumerated, not that a human
  // accepted them or that a change is safe for a particular descendant.
  const paths = revisionQualificationPaths(revision, previous);
  recordCheck("prior_revision_compare", true, previous
    ? `Compared with source revision ${previous.source.number}; ${paths.length} changed paths retained for review.`
    : "First source revision; no prior definition exists.");
  return revisionQualificationSchema.parse({
    id: input.id, schemaVersion: 1, source, previousRevisionId: previous?.source.revisionId ?? null,
    comparedPaths: paths, evidence, automatedStatus: evidence.every(item => item.status === "passed") ? "passed" : "failed",
    humanReview: { status: "pending", reason: "review_policy_pending" }, evaluatedBy: input.evaluatedBy, evaluatedAt: input.evaluatedAt,
  });
}

export function parseRevisionQualification(raw: unknown, source: QualificationRevisionRef): RevisionQualification {
  const parsed = revisionQualificationSchema.safeParse(raw);
  if (!parsed.success) throw new VersionValidationError("The qualification record is invalid.");
  if (!sameQualificationRevision(parsed.data.source, source)) throw new VersionStaleError("Qualification evidence belongs to another source revision.");
  return parsed.data;
}

/** Storage-side checks independently validate all locally reproducible evidence.
 * A trusted rehearsal failure may remain failed even if schema checks pass. */
export function assertQualificationMatchesRevision(record: RevisionQualification, revision: SourceRevision, previous: SourceRevision | null): void {
  parseRevisionQualification(record, revision.source);
  if (record.previousRevisionId !== (previous?.source.revisionId ?? null)
    || !jsonEqual(record.comparedPaths, revisionQualificationPaths(revision, previous))) throw new VersionStaleError();
  let shareable = true; let declared = true;
  try { assertShareableDefinition(revision.definition); } catch { shareable = false; }
  try { assertDeclaredPackageBehavior(revision.definition, revision.definition.declaration, revision.requires.bindingKinds); } catch { declared = false; }
  const passed = (name: typeof REVISION_QUALIFICATION_CHECKS[number]) => record.evidence.find(item => item.check === name)?.status === "passed";
  if (passed("shareable_definition") !== shareable || passed("declaration_match") !== declared
    || !passed("prior_revision_compare") || (passed("rehearsal") && !(shareable && declared))) throw new VersionStaleError();
}

function revisionQualificationPaths(revision: SourceRevision, previous: SourceRevision | null): string[] {
  const paths = previous ? changedPaths(previous.definition, revision.definition) : [];
  if (previous && !jsonEqual(previous.requires, revision.requires)) paths.push("$requires.bindingKinds");
  return paths;
}
