import {
  capabilityIdSchema,
  capabilityVersionSchema,
  qualificationEvidenceSchema,
  qualificationRecordSchema,
  type CapabilityQualificationEvidence,
  type CapabilityQualificationRecord,
  type ExecutableCapabilityDefinition,
  type QualifiedExecutableCapability,
} from "./contracts";

export type CapabilityUnavailableReason =
  | "unknown_capability"
  | "version_unavailable"
  | "not_qualified"
  | "entrance_unavailable";

export class CapabilityUnavailableError extends Error {
  readonly capabilityId: string;
  readonly capabilityVersion: number | undefined;
  readonly reason: CapabilityUnavailableReason;

  constructor(
    capabilityId: string,
    reason: CapabilityUnavailableReason,
    capabilityVersion?: number,
  ) {
    const version = capabilityVersion === undefined ? "" : ` version ${capabilityVersion}`;
    super(`Executable capability ${capabilityId}${version} is unavailable (${reason}).`);
    this.name = "CapabilityUnavailableError";
    this.capabilityId = capabilityId;
    this.capabilityVersion = capabilityVersion;
    this.reason = reason;
  }
}

/**
 * Qualification is an explicit, exact-version witness. A definition is never
 * executable merely because it appears in a descriptive product catalog.
 */
export function qualifyCapability<TInput = unknown, TResult = unknown>(
  definition: ExecutableCapabilityDefinition<TInput, TResult>,
  rawEvidence: readonly CapabilityQualificationEvidence[],
  qualifiedAt: string,
  note: string,
): QualifiedExecutableCapability<TInput, TResult> {
  const evidence = rawEvidence.map((item) => qualificationEvidenceSchema.parse(item));
  if (!evidence.length) throw new Error(`Capability ${definition.id} requires qualification evidence.`);
  for (const item of evidence) {
    if (item.capabilityId !== definition.id || item.capabilityVersion !== definition.version) {
      throw new Error(`Qualification evidence is not bound to capability ${definition.id} version ${definition.version}.`);
    }
    if (item.status !== "passed") {
      throw new Error(`Capability ${definition.id} has failed qualification evidence.`);
    }
  }
  const qualification = qualificationRecordSchema.parse({
    capabilityId: definition.id,
    capabilityVersion: definition.version,
    status: "qualified",
    qualifiedAt,
    evidence,
    note,
  });
  return Object.freeze({ definition, qualification });
}

export function parseQualificationRecord(raw: unknown): CapabilityQualificationRecord {
  return qualificationRecordSchema.parse(raw);
}

export function isCapabilityQualified(
  definition: ExecutableCapabilityDefinition,
  qualification: CapabilityQualificationRecord | null | undefined,
): qualification is CapabilityQualificationRecord {
  const parsed = qualificationRecordSchema.safeParse(qualification);
  if (!parsed.success || parsed.data.status !== "qualified") return false;
  if (parsed.data.capabilityId !== definition.id || parsed.data.capabilityVersion !== definition.version) return false;
  return parsed.data.evidence.every((evidence) =>
    evidence.capabilityId === definition.id &&
    evidence.capabilityVersion === definition.version &&
    evidence.status === "passed",
  );
}

export function assertQualificationVersion(
  capabilityId: string,
  capabilityVersion: number,
  qualification: CapabilityQualificationRecord,
): void {
  const id = capabilityIdSchema.parse(capabilityId);
  const version = capabilityVersionSchema.parse(capabilityVersion);
  if (qualification.capabilityId !== id || qualification.capabilityVersion !== version) {
    throw new CapabilityUnavailableError(id, "not_qualified", version);
  }
  if (!isQualificationEvidenceValid(qualification.evidence, id, version)) {
    throw new CapabilityUnavailableError(id, "not_qualified", version);
  }
}

export function isQualificationEvidenceValid(
  evidence: readonly CapabilityQualificationEvidence[],
  capabilityId: string,
  capabilityVersion: number,
): boolean {
  const id = capabilityIdSchema.safeParse(capabilityId);
  const version = capabilityVersionSchema.safeParse(capabilityVersion);
  if (!id.success || !version.success || !evidence.length) return false;
  return evidence.every((item) => {
    const parsed = qualificationEvidenceSchema.safeParse(item);
    return parsed.success &&
      parsed.data.capabilityId === id.data &&
      parsed.data.capabilityVersion === version.data &&
      parsed.data.status === "passed";
  });
}
