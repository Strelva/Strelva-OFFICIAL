import {
  capabilityAdapterKeySchema,
  capabilityAuthoritySchema,
  capabilityCompatibilitySchema,
  capabilityCostSchema,
  capabilityEntranceSchema,
  capabilityExecutionSchema,
  capabilityIdSchema,
  capabilityOwningScopeSchema,
  capabilitySupportSchema,
  capabilityVersionSchema,
  type CapabilityEntrance,
  type ExecutableCapabilityDefinition,
  type ExecutableCapabilityDescriptor,
  type QualifiedExecutableCapability,
} from "./contracts";
import {
  CapabilityUnavailableError,
  isCapabilityQualified,
  parseQualificationRecord,
} from "./qualification";
import { capabilityDescriptor } from "./contracts";

export interface CapabilityRegistry {
  /** Qualified entries only; descriptive catalog records are not included. */
  list(entrance?: CapabilityEntrance): readonly QualifiedExecutableCapability[];
  listDescriptors(entrance?: CapabilityEntrance): readonly ExecutableCapabilityDescriptor[];
  get(id: string, version?: number): QualifiedExecutableCapability | null;
  require(id: string, version?: number, entrance?: CapabilityEntrance): QualifiedExecutableCapability;
  requireExact(id: string, version: number, entrance?: CapabilityEntrance): QualifiedExecutableCapability;
}

function freezeDefinitions(
  definitions: readonly ExecutableCapabilityDefinition[],
): readonly ExecutableCapabilityDefinition[] {
  const seen = new Set<string>();
  const result = definitions.map((definition) => {
    const id = capabilityIdSchema.parse(definition.id);
    const version = capabilityVersionSchema.parse(definition.version);
    capabilitySupportSchema.parse(definition.support);
    capabilityOwningScopeSchema.parse(definition.owningScope);
    capabilityAuthoritySchema.parse(definition.authority);
    capabilityCostSchema.parse(definition.cost);
    capabilityExecutionSchema.parse(definition.execution);
    capabilityAdapterKeySchema.parse(definition.adapterKey);
    capabilityEntranceSchema.array().parse(definition.entrances);
    capabilityCompatibilitySchema.parse(definition.compatibility);
    if (definition.contractVersion !== 1) throw new Error(`Unsupported capability contract for ${id}.`);
    if (definition.compatibility.contractVersion !== definition.contractVersion) {
      throw new Error(`Capability ${id} has an incompatible contract declaration.`);
    }
    if (definition.compatibility.inputVersion !== version || definition.compatibility.outputVersion !== version) {
      throw new Error(`Capability ${id} must bind compatibility versions to its definition version.`);
    }
    if (definition.compatibility.resourceKinds.length !== 1 || definition.compatibility.resourceKinds[0] !== definition.resourceKind) {
      throw new Error(`Capability ${id} must declare its owning resource kind exactly once.`);
    }
    if (definition.compatibility.entrances.some((entrance) => !definition.entrances.includes(entrance))) {
      throw new Error(`Capability ${id} advertises an unsupported entrance.`);
    }
    if (definition.entrances.length === 0) throw new Error(`Capability ${id} needs an entrance.`);
    const key = `${id}@${version}`;
    if (seen.has(key)) throw new Error(`Duplicate executable capability ${key}.`);
    seen.add(key);
    return Object.freeze({
      ...definition,
      id,
      version,
      authority: Object.freeze({
        ...definition.authority,
        requirements: Object.freeze([...definition.authority.requirements]),
      }),
      cost: Object.freeze({ ...definition.cost }),
      execution: Object.freeze({
        ...definition.execution,
        idempotency: Object.freeze({
          ...definition.execution.idempotency,
          keyFields: Object.freeze([...definition.execution.idempotency.keyFields]),
        }),
        reconciliation: Object.freeze({ ...definition.execution.reconciliation }),
        verification: Object.freeze({ ...definition.execution.verification }),
      }),
      entrances: Object.freeze([...definition.entrances]),
      compatibility: Object.freeze({
        ...definition.compatibility,
        resourceKinds: Object.freeze([...definition.compatibility.resourceKinds]),
        entrances: Object.freeze([...definition.compatibility.entrances]),
      }),
    });
  });
  return Object.freeze(result);
}

function freezeQualified(
  definitions: readonly ExecutableCapabilityDefinition[],
  qualifications: readonly QualifiedExecutableCapability[],
): readonly QualifiedExecutableCapability[] {
  const byKey = new Map<string, QualifiedExecutableCapability["qualification"]>();
  for (const qualified of qualifications) {
    const qualification = parseQualificationRecord(qualified.qualification);
    const key = `${qualification.capabilityId}@${qualification.capabilityVersion}`;
    if (byKey.has(key)) throw new Error(`Duplicate capability qualification ${key}.`);
    byKey.set(key, Object.freeze({
      ...qualification,
      evidence: Object.freeze(qualification.evidence.map((item) => Object.freeze({ ...item }))),
    }));
  }
  const result = definitions.flatMap((definition) => {
    if (definition.compatibility.status !== "compatible") return [];
    const qualification = byKey.get(`${definition.id}@${definition.version}`);
    if (!qualification || !isCapabilityQualified(definition, qualification)) return [];
    return [Object.freeze({ definition, qualification })];
  });
  return Object.freeze(result);
}

/**
 * Build a registry from server-owned definitions and explicit witnesses. The
 * factory is the only qualification boundary; callers cannot qualify a
 * capability by changing a discovery payload.
 */
export function createCapabilityRegistry(input: {
  definitions: readonly ExecutableCapabilityDefinition[];
  qualifications: readonly QualifiedExecutableCapability[];
}): CapabilityRegistry {
  const definitions = freezeDefinitions(input.definitions);
  const qualified = freezeQualified(definitions, input.qualifications);
  const allById = new Map<string, readonly ExecutableCapabilityDefinition[]>();
  for (const definition of definitions) {
    allById.set(definition.id, [...(allById.get(definition.id) ?? []), definition]);
  }
  const qualifiedByKey = new Map(qualified.map((item) => [
    `${item.definition.id}@${item.definition.version}`,
    item,
  ]));

  function parsedId(raw: string): string {
    return capabilityIdSchema.parse(raw);
  }

  function parsedVersion(raw: number): number {
    return capabilityVersionSchema.parse(raw);
  }

  function list(entrance?: CapabilityEntrance): readonly QualifiedExecutableCapability[] {
    if (!entrance) return qualified;
    return Object.freeze(qualified.filter((item) => item.definition.entrances.includes(entrance)));
  }

  function get(idInput: string, versionInput?: number): QualifiedExecutableCapability | null {
    const id = parsedId(idInput);
    const definitionsForId = allById.get(id);
    if (!definitionsForId?.length) return null;
    const definition = versionInput === undefined
      ? [...definitionsForId].sort((left, right) => right.version - left.version)[0]
      : definitionsForId.find((candidate) => candidate.version === parsedVersion(versionInput));
    if (!definition) return null;
    return qualifiedByKey.get(`${definition.id}@${definition.version}`) ?? null;
  }

  function requireExact(idInput: string, versionInput: number, entrance?: CapabilityEntrance): QualifiedExecutableCapability {
    const id = parsedId(idInput);
    const version = parsedVersion(versionInput);
    const definitionsForId = allById.get(id);
    if (!definitionsForId?.length) throw new CapabilityUnavailableError(id, "unknown_capability", version);
    const definition = definitionsForId.find((candidate) => candidate.version === version);
    if (!definition) throw new CapabilityUnavailableError(id, "version_unavailable", version);
    const qualified = qualifiedByKey.get(`${id}@${version}`);
    if (!qualified) throw new CapabilityUnavailableError(id, "not_qualified", version);
    if (entrance && !definition.entrances.includes(entrance)) {
      throw new CapabilityUnavailableError(id, "entrance_unavailable", version);
    }
    return qualified;
  }

  return Object.freeze({
    list,
    listDescriptors: (entrance?: CapabilityEntrance) => Object.freeze(list(entrance).map((item) => capabilityDescriptor(item.definition))),
    get,
    require: (id: string, version?: number, entrance?: CapabilityEntrance) => {
      const parsed = parsedId(id);
      const definitionsForId = allById.get(parsed);
      if (!definitionsForId?.length) throw new CapabilityUnavailableError(parsed, "unknown_capability", version);
      const selectedVersion = version ?? [...definitionsForId].sort((left, right) => right.version - left.version)[0]!.version;
      return requireExact(parsed, selectedVersion, entrance);
    },
    requireExact,
  });
}

export { capabilityDescriptor };
