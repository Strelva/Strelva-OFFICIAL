import { z } from "zod";
import { assertShareableDefinition, changedPaths, type JsonObject } from "./compare";
import { VersionValidationError, type SourceRevision } from "./types";

const names = z.array(z.string().trim().min(1).max(160)).max(100).refine(values => new Set(values).size === values.length, "Declaration entries must be unique.");
export const packageDeclarationSchema = z.object({
  recordsRead: names, recordsWritten: names, businessRecordFields: names,
  outsideEffects: z.array(z.enum(["email", "publish", "google", "payment"])).max(4),
  bindingKinds: names, dataLeavingBusiness: names,
}).strict();
export type PackageDeclaration = z.infer<typeof packageDeclarationSchema>;
export const revisionQualificationSchema = z.object({
  revisionId: z.string().min(1), status: z.enum(["pending", "qualified", "rejected"]),
  evidence: z.array(z.object({ revisionId: z.string().min(1), check: z.enum(["shareable_definition", "declaration_match", "rehearsal", "prior_revision_compare"]), status: z.enum(["passed", "failed"]), note: z.string().min(1) }).strict()).min(4).max(4),
  humanReview: z.object({ state: z.enum(["pending", "approved", "rejected"]), reviewerId: z.string().nullable(), reviewedAt: z.string().nullable(), note: z.string() }).strict(),
}).strict();
export type RevisionQualification = z.infer<typeof revisionQualificationSchema>;

/** Closed runtime behavior, not a creator's assertion about arbitrary code.
 * Unsupported definitions cannot be declared, qualified or listed. */
export function effectivePackageBehavior(definition: JsonObject, bindingKinds: readonly string[] = []): PackageDeclaration {
  assertShareableDefinition(definition);
  if (definition.kind === "bundle") {
    if (Object.keys(definition).some(key => !["kind", "systems"].includes(key)) || !Array.isArray(definition.systems) || !definition.systems.length || definition.systems.length > 16) throw new VersionValidationError("A bundle needs one to sixteen closed System definitions.");
    const parts = definition.systems.map(item => {
      if (!item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).some(key => !["key", "name", "definition"].includes(key)) || typeof item.key !== "string" || typeof item.name !== "string" || !item.definition || typeof item.definition !== "object" || Array.isArray(item.definition) || item.definition.kind === "bundle") throw new VersionValidationError("Each bundle System needs a unique key, name and supported definition.");
      return effectivePackageBehavior(item.definition, bindingKinds);
    });
    if (new Set(definition.systems.map(item => (item as JsonObject).key)).size !== definition.systems.length) throw new VersionValidationError("Bundle System keys must be unique.");
    return packageDeclarationSchema.parse(Object.fromEntries(Object.keys(parts[0]!).map(key => [key, [...new Set(parts.flatMap(part => part[key as keyof PackageDeclaration]))].sort()])));
  }
  if (definition.kind !== "internal_app" || Object.keys(definition).some(key => !["kind", "title", "fields", "components"].includes(key)) || !Array.isArray(definition.fields) || !Array.isArray(definition.components)) throw new VersionValidationError("This runtime has no verified package declaration adapter.");
  const fields = definition.fields as JsonObject[];
  return packageDeclarationSchema.parse({
    recordsRead: ["application.records"], recordsWritten: ["application.records"],
    businessRecordFields: [...new Set(fields.flatMap(field => field.type === "contact" ? ["contacts.id", "contacts.name"] : field.type === "assigned_person" ? ["people.id", "people.name"] : []))].sort(),
    outsideEffects: [], bindingKinds: [...new Set(bindingKinds)].sort(), dataLeavingBusiness: [],
  });
}

export function assertPackageDeclaration(definition: JsonObject, declaration: PackageDeclaration, bindings: readonly string[] = []): void {
  const declared = packageDeclarationSchema.parse(declaration);
  const actual = effectivePackageBehavior(definition, bindings);
  for (const key of Object.keys(actual) as Array<keyof PackageDeclaration>) {
    if (actual[key].some(value => !(declared[key] as readonly string[]).includes(value))) throw new VersionValidationError(`This System exceeds its package declaration: ${key}.`);
  }
}

export interface PackageRehearsalReceipt { revisionId: string; checks: Array<{ name: string; passed: boolean }>; reference: string }
export function automatedRevisionQualification(revision: SourceRevision, previous?: SourceRevision, rehearsal?: PackageRehearsalReceipt): RevisionQualification {
  const evidence: RevisionQualification["evidence"] = [];
  for (const check of ["shareable_definition", "declaration_match", "rehearsal", "prior_revision_compare"] as const) {
    try {
      if (check === "shareable_definition") assertShareableDefinition(revision.definition);
      if (check === "declaration_match") {
        if (!revision.declaration) throw new Error("The immutable revision has no declaration.");
        assertPackageDeclaration(revision.definition, revision.declaration, revision.requires.bindingKinds);
      }
      if (check === "rehearsal" && (!rehearsal || rehearsal.revisionId !== revision.source.revisionId || !rehearsal.checks.length || rehearsal.checks.some(item => !item.passed))) throw new Error("A passing isolated native-runtime rehearsal receipt for this exact revision is required.");
      const paths = previous ? changedPaths(previous.definition, revision.definition) : [];
      evidence.push({ revisionId: revision.source.revisionId, check, status: "passed", note: check === "prior_revision_compare" ? `Compared definition against prior revision ${previous?.source.number ?? "none"}; ${paths.length} changed paths. Behavior equivalence is not inferred.` : check === "rehearsal" ? rehearsal!.reference : "Passed." });
    } catch (error) { evidence.push({ revisionId: revision.source.revisionId, check, status: "failed", note: error instanceof Error ? error.message : "Failed." }); }
  }
  return { revisionId: revision.source.revisionId, status: "pending", evidence, humanReview: { state: "pending", reviewerId: null, reviewedAt: null, note: "Human reviewer policy has to be configured before approval." } };
}

export function isRevisionQualified(revision: { source: { revisionId: string }; qualification?: unknown }): boolean {
  const parsed = revisionQualificationSchema.safeParse(revision.qualification);
  return parsed.success && parsed.data.revisionId === revision.source.revisionId && parsed.data.status === "qualified" && parsed.data.humanReview.state === "approved" && !!parsed.data.humanReview.reviewerId && !!parsed.data.humanReview.reviewedAt && new Set(parsed.data.evidence.map(item => item.check)).size === 4 && parsed.data.evidence.every(item => item.revisionId === revision.source.revisionId && item.status === "passed");
}
