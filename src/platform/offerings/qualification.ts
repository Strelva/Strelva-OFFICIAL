import { z } from "zod";
import {
  capabilityAuthorityRequirementSchema,
  capabilityEffectSchema,
  qualificationEvidenceSchema,
  qualificationRecordSchema,
} from "@/platform/capabilities";
import { OFFERING_DATA_CLASSES, type OfferingDefinitionView } from "./types";

/**
 * Offering qualification reuses the executable-capability qualification
 * contract (evidence kinds, environments, passed-only evidence, exact-version
 * binding). Only the subject differs: an offering id and its semantic version
 * instead of a capability id and integer version.
 */
const offeringIdSchema = z.string().trim().min(1).max(80).regex(/^[a-z][a-z0-9_]*$/);
const offeringVersionSchema = z.string().trim().min(1).max(32).regex(/^\d+\.\d+\.\d+$/);

export const offeringQualificationEvidenceSchema = qualificationEvidenceSchema
  .omit({ capabilityId: true, capabilityVersion: true })
  .extend({ offeringId: offeringIdSchema, offeringVersion: offeringVersionSchema })
  .strict();

export type OfferingQualificationEvidence = z.infer<typeof offeringQualificationEvidenceSchema>;

export const offeringQualificationRecordSchema = qualificationRecordSchema
  .omit({ capabilityId: true, capabilityVersion: true, evidence: true })
  .extend({
    offeringId: offeringIdSchema,
    offeringVersion: offeringVersionSchema,
    evidence: z.array(offeringQualificationEvidenceSchema).min(1).max(20).readonly(),
  })
  .strict();

export type OfferingQualificationRecord = z.infer<typeof offeringQualificationRecordSchema>;

const identifier = z.string().trim().min(1).max(80).regex(/^[a-z][a-z0-9_]*$/);
const text = (maximum: number) => z.string().trim().min(1).max(maximum);

/** ADR 0010 declaration contract. Missing or empty declarations are rejected. */
export const offeringDeclarationSchema = z.object({
  data: z.array(z.object({
    class: z.enum(OFFERING_DATA_CLASSES),
    access: z.enum(["read", "write"]),
    heldBy: identifier,
    description: text(300),
  }).strict()).min(1).max(16),
  permissions: z.array(z.object({
    scope: identifier,
    effect: capabilityEffectSchema,
    authority: z.array(capabilityAuthorityRequirementSchema).min(1).max(6),
  }).strict()).min(1).max(16),
  outsideSystems: z.array(z.object({
    id: identifier,
    name: text(120),
    purpose: text(300),
  }).strict()).max(8),
  madeBy: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("strelva"), name: z.literal("Strelva") }).strict(),
    z.object({ kind: z.literal("agency"), name: text(160) }).strict(),
  ]),
}).strict();

/**
 * Validate the declaration and its coherence with the definition: every scope
 * has exactly one permission declaration, and every data holder is Strelva or
 * a declared outside system.
 */
export function assertOfferingDeclaration(definition: Pick<OfferingDefinitionView, "id" | "version" | "scopes"> & { declaration?: unknown }): void {
  const label = `Offering ${definition.id} ${definition.version}`;
  const parsed = offeringDeclarationSchema.safeParse(definition.declaration);
  if (!parsed.success) throw new Error(`${label} has a missing or invalid declaration.`);
  const declaration = parsed.data;
  const scopeIds = definition.scopes.map((scope) => scope.id);
  const permissionScopes = declaration.permissions.map((permission) => permission.scope);
  if (new Set(permissionScopes).size !== permissionScopes.length
    || permissionScopes.length !== scopeIds.length
    || scopeIds.some((scope) => !permissionScopes.includes(scope))) {
    throw new Error(`${label} must declare the permission of every scope exactly once.`);
  }
  const systemIds = declaration.outsideSystems.map((system) => system.id);
  if (new Set(systemIds).size !== systemIds.length || systemIds.includes("strelva")) {
    throw new Error(`${label} declares an ambiguous outside system.`);
  }
  if (declaration.data.some((item) => item.heldBy !== "strelva" && !systemIds.includes(item.heldBy))) {
    throw new Error(`${label} declares data held by an undeclared outside system.`);
  }
}

/**
 * Qualification is an explicit witness for one exact definition version. It
 * never substitutes for the caller's business authority or native checks.
 */
export function qualifyOffering(
  definition: Pick<OfferingDefinitionView, "id" | "version">,
  rawEvidence: readonly OfferingQualificationEvidence[],
  qualifiedAt: string,
  note: string,
): OfferingQualificationRecord {
  const evidence = rawEvidence.map((item) => offeringQualificationEvidenceSchema.parse(item));
  if (!evidence.length) throw new Error(`Offering ${definition.id} requires qualification evidence.`);
  for (const item of evidence) {
    if (item.offeringId !== definition.id || item.offeringVersion !== definition.version) {
      throw new Error(`Qualification evidence is not bound to offering ${definition.id} version ${definition.version}.`);
    }
    if (item.status !== "passed") throw new Error(`Offering ${definition.id} has failed qualification evidence.`);
  }
  return Object.freeze(offeringQualificationRecordSchema.parse({
    offeringId: definition.id,
    offeringVersion: definition.version,
    status: "qualified",
    qualifiedAt,
    evidence,
    note,
  }));
}

export function isOfferingQualified(
  definition: Pick<OfferingDefinitionView, "id" | "version">,
  qualification: OfferingQualificationRecord | null | undefined,
): qualification is OfferingQualificationRecord {
  const parsed = offeringQualificationRecordSchema.safeParse(qualification);
  if (!parsed.success) return false;
  if (parsed.data.offeringId !== definition.id || parsed.data.offeringVersion !== definition.version) return false;
  return parsed.data.evidence.every((item) =>
    item.offeringId === definition.id && item.offeringVersion === definition.version && item.status === "passed");
}
