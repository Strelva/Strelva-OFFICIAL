import type { z } from "zod";
import { WorkspaceConflictError } from "@/platform/workspaces/types";
import {
  type applicationSchema,
  type applicationCommandSchema,
  APPLICATION_RECORD_LIMIT,
  type applicationReviseInputSchema,
  type applicationRehearseInputSchema,
  type applicationPublishInputSchema,
  type applicationRollbackInputSchema,
  applicationReleaseSchema,
  applicationSpecSchema,
  APPLICATION_VERSION_HISTORY_LIMIT,
  type ApplicationCandidate,
  type ApplicationRecord,
  type ApplicationRelease,
  type ApplicationSpec,
} from "./contracts";
import { isApplicationDateOnly } from "./date-only";

/** Native application rules. No storage, framework, provider, or authorization effects. */
export type ApplicationStatus = "draft" | "installed" | "retired";

export type VersionedSpec = { version: number; spec: ApplicationSpec };

export type ApplicationPayload = z.infer<typeof applicationSchema>;

export type ApplicationRehearsal = ApplicationCandidate["rehearsal"];

export interface ApplicationState {
  candidate: ApplicationCandidate;
  versions: VersionedSpec[];
  releases: ApplicationRelease[];
  currentReleaseVersion: number | null;
  records: ApplicationRecord[];
  recordsRevision: number;
  status: ApplicationStatus;
  installation?: ApplicationPayload["installation"];
  history: ApplicationPayload["history"];
  legacyRevision: number;
}

export function appendVersion<T>(values: T[], value: T, message: string): T[] {
  if (values.length >= APPLICATION_VERSION_HISTORY_LIMIT) throw new WorkspaceConflictError(message);
  return [...values, value];
}

export function currentRelease(state: ApplicationState): ApplicationRelease | null {
  if (state.currentReleaseVersion === null) return null;
  return state.releases.find((release) => release.version === state.currentReleaseVersion) ?? null;
}

export function releaseSpec(state: ApplicationState): ApplicationSpec | null {
  return currentRelease(state)?.spec ?? null;
}

export function validateRecord(spec: ApplicationSpec, record: ApplicationRecord): void {
  const fields = new Map(spec.fields.map((field) => [field.id, field]));
  for (const key of Object.keys(record.values)) {
    if (!fields.has(key)) throw new WorkspaceConflictError("This form contains unknown fields.");
  }
  for (const field of spec.fields) {
    const value = record.values[field.id];
    if (value === undefined || value === "") {
      if (field.required) throw new WorkspaceConflictError(`${field.label} is required.`);
      continue;
    }
    const expectedType = field.type === "text" || field.type === "select" || field.type === "date" ? "string" : field.type;
    if (typeof value !== expectedType) throw new WorkspaceConflictError(`${field.label} has the wrong type.`);
    if (field.type === "select" && !field.options.includes(value as string)) {
      throw new WorkspaceConflictError(`${field.label} must use one of the available options.`);
    }
    if (field.type === "date" && !isApplicationDateOnly(value)) {
      throw new WorkspaceConflictError(`${field.label} must be a real date in YYYY-MM-DD format.`);
    }
  }
}

export function compatibilityChecks(state: ApplicationState): Array<{ name: string; passed: boolean }> {
  const specValid = applicationSpecSchema.safeParse(state.candidate.spec).success;
  const executableRejected = applicationSpecSchema.safeParse({ ...state.candidate.spec, script: "alert(1)" }).success === false;
  let recordsFit = true;
  try {
    for (const record of state.records) validateRecord(state.candidate.spec, record);
  } catch {
    recordsFit = false;
  }
  return [
    { name: "Declared fields and approved components", passed: specValid },
    { name: "Executable code rejected", passed: executableRejected },
    { name: "Existing records fit this version", passed: recordsFit },
  ];
}

export function normalizeReleaseVersion(value: number | null | undefined): number | null {
  return value === undefined || value === null || value === 0 ? null : value;
}

export function cloneState(state: ApplicationState): ApplicationState {
  return structuredClone(state);
}

export function reviseCandidate(current: ApplicationState, input: z.infer<typeof applicationReviseInputSchema>): ApplicationState {
  if (current.candidate.designRevision !== input.expectedDesignRevision) throw new WorkspaceConflictError("This application candidate changed. Reload before editing it.");
  const state = cloneState(current);
  if (input.spec.maintenanceOwner !== state.candidate.spec.maintenanceOwner) {
    throw new WorkspaceConflictError("Changing maintenance responsibility requires an accepted handoff.");
  }
  state.candidate = {
    designRevision: input.expectedDesignRevision + 1,
    specVersion: state.candidate.specVersion + 1,
    spec: input.spec,
    rehearsal: null,
  };
  state.versions = appendVersion(state.versions, { version: state.candidate.specVersion, spec: input.spec }, "This application has reached its candidate history limit.");
  state.status = "draft";
  return state;
}

export function rehearseCandidate(current: ApplicationState, input: z.infer<typeof applicationRehearseInputSchema>): ApplicationState {
  if (current.candidate.designRevision !== input.expectedDesignRevision) throw new WorkspaceConflictError("This application candidate changed. Reload before rehearsing it.");
  const state = cloneState(current);
  state.candidate.rehearsal = { specVersion: state.candidate.specVersion, checks: compatibilityChecks(state) };
  return state;
}

export function publishCandidate(
  current: ApplicationState,
  input: z.infer<typeof applicationPublishInputSchema>,
  publication: { at: string; by: string },
): ApplicationState {
  const state = cloneState(current);
  if (state.candidate.designRevision !== input.expectedCandidateRevision) throw new WorkspaceConflictError("This application candidate changed. Reload before publishing it.");
  if (state.currentReleaseVersion !== normalizeReleaseVersion(input.expectedReleaseVersion)) throw new WorkspaceConflictError("This application release changed. Reload before publishing it.");
  if (!state.candidate.rehearsal || state.candidate.rehearsal.specVersion !== state.candidate.specVersion || state.candidate.rehearsal.checks.some((check) => !check.passed)) {
    throw new WorkspaceConflictError("Run a passing rehearsal for this candidate first.");
  }
  // Validate every record at publication, not just the earlier rehearsal.
  for (const record of state.records) validateRecord(state.candidate.spec, record);
  const nextVersion = Math.max(0, ...state.releases.map((release) => release.version)) + 1;
  const release = applicationReleaseSchema.parse({
    version: nextVersion,
    spec: state.candidate.spec,
    publishedAt: publication.at,
    publishedBy: publication.by,
    provenance: "published",
  });
  state.releases = appendVersion(state.releases, release, "This application has reached its release history limit.");
  state.currentReleaseVersion = release.version;
  state.status = "installed";
  return state;
}

export function rollbackRelease(current: ApplicationState, input: z.infer<typeof applicationRollbackInputSchema>): ApplicationState {
  const state = cloneState(current);
  if (state.candidate.designRevision !== input.expectedDesignRevision) throw new WorkspaceConflictError("This application candidate changed. Reload before rolling it back.");
  if (state.currentReleaseVersion !== normalizeReleaseVersion(input.expectedReleaseVersion)) throw new WorkspaceConflictError("This application release changed. Reload before rolling it back.");
  const target = state.releases.find((release) => release.version === input.version);
  if (!target) throw new WorkspaceConflictError("That released application version is unavailable.");
  for (const record of state.records) validateRecord(target.spec, record);
  state.currentReleaseVersion = target.version;
  state.candidate = {
    designRevision: state.candidate.designRevision + 1,
    specVersion: state.candidate.specVersion + 1,
    spec: target.spec,
    rehearsal: null,
  };
  state.versions = appendVersion(state.versions, { version: state.candidate.specVersion, spec: target.spec }, "This application has reached its candidate history limit.");
  state.status = "installed";
  return state;
}

/** Legacy dashboard commands keep their immediate record-compatibility checks. */
export type LegacyApplicationCommand = Exclude<z.infer<typeof applicationCommandSchema>, { kind: "publish" | "rollback_release" }>;

export function assertLegacyApplicationRevision(current: ApplicationState, command: LegacyApplicationCommand): void {
  const aggregateRevision = "expectedRevision" in command ? command.expectedRevision : undefined;
  const designRevision = "expectedDesignRevision" in command ? command.expectedDesignRevision : undefined;
  if (aggregateRevision !== undefined) {
    if (current.legacyRevision !== aggregateRevision) throw new WorkspaceConflictError("This work changed. Reload before trying again.");
  } else if (designRevision !== undefined && current.candidate.designRevision !== designRevision) {
    throw new WorkspaceConflictError("This application candidate changed. Reload before trying again.");
  }
}

/** Apply a dashboard command without storage or authorization effects.
 * The caller resolves and authorizes a reusable source before supplying it. */
export function applyLegacyApplicationCommand(
  current: ApplicationState,
  command: LegacyApplicationCommand,
  actorId: string,
  at: string,
  source?: ApplicationState,
): ApplicationState {
  const state = cloneState(current);
  assertLegacyApplicationRevision(current, command);

  if (command.kind === "adopt_update") {
    if (!state.installation) throw new WorkspaceConflictError("This application has no reusable source.");
    if (!source) throw new WorkspaceConflictError("The selected source version is not currently available for installation.");
    const sourceRelease = source.releases.find((release) => release.version === command.sourceVersion);
    if (!sourceRelease || source.currentReleaseVersion !== command.sourceVersion || source.status === "retired") {
      throw new WorkspaceConflictError("The selected source version is not currently available for installation.");
    }
    if (state.installation.sourceVersion === command.sourceVersion) throw new WorkspaceConflictError("This source version is already installed.");
    const base = state.installation.baseSpec;
    const remote = applicationSpecSchema.parse({ ...sourceRelease.spec, maintenanceOwner: state.candidate.spec.maintenanceOwner });
    function merge<T>(previous: T, local: T, incoming: T): T {
      const changed = JSON.stringify(local) !== JSON.stringify(previous);
      if (changed && JSON.stringify(incoming) !== JSON.stringify(previous) && JSON.stringify(local) !== JSON.stringify(incoming)) {
        throw new WorkspaceConflictError("This source update conflicts with local changes. Keep the current version until those changes are reconciled.");
      }
      return changed ? local : incoming;
    }
    const spec = applicationSpecSchema.parse({
      title: merge(base.title, state.candidate.spec.title, remote.title),
      maintenanceOwner: state.candidate.spec.maintenanceOwner,
      fields: merge(base.fields, state.candidate.spec.fields, remote.fields),
      components: merge(base.components, state.candidate.spec.components, remote.components),
    });
    for (const record of state.records) validateRecord(spec, record);
    state.candidate = { designRevision: state.candidate.designRevision + 1, specVersion: state.candidate.specVersion + 1, spec, rehearsal: null };
    state.versions = appendVersion(state.versions, { version: state.candidate.specVersion, spec }, "This application has reached its candidate history limit.");
    state.installation = { ...state.installation, sourceVersion: command.sourceVersion, baseSpec: remote };
    state.status = "draft";
    return state;
  }
  if (command.kind === "revise") {
    // The compatibility command preserves the old dashboard contract and
    // rejects data-breaking edits immediately. The explicit revise method
    // allows a candidate to be rehearsed and rejected at publication.
    for (const record of state.records) validateRecord(command.spec, record);
    if (command.spec.maintenanceOwner !== state.candidate.spec.maintenanceOwner) throw new WorkspaceConflictError("Changing maintenance responsibility requires an accepted handoff.");
    state.candidate = { designRevision: state.candidate.designRevision + 1, specVersion: state.candidate.specVersion + 1, spec: command.spec, rehearsal: null };
    state.versions = appendVersion(state.versions, { version: state.candidate.specVersion, spec: command.spec }, "This application has reached its candidate history limit.");
    state.status = "draft";
    return state;
  }
  if (command.kind === "rehearse") {
    state.candidate.rehearsal = { specVersion: state.candidate.specVersion, checks: compatibilityChecks(state) };
    return state;
  }
  if (command.kind === "install") {
    if (!state.candidate.rehearsal || state.candidate.rehearsal.specVersion !== state.candidate.specVersion || state.candidate.rehearsal.checks.some((check) => !check.passed)) throw new WorkspaceConflictError("Run a passing rehearsal for this version first.");
    for (const record of state.records) validateRecord(state.candidate.spec, record);
    const nextVersion = Math.max(0, ...state.releases.map((release) => release.version)) + 1;
    const release = applicationReleaseSchema.parse({ version: nextVersion, spec: state.candidate.spec, publishedAt: at, publishedBy: actorId, provenance: "published" });
    state.releases = appendVersion(state.releases, release, "This application has reached its release history limit.");
    state.currentReleaseVersion = release.version;
    state.status = "installed";
    return state;
  }
  if (command.kind === "retire") {
    state.status = "retired";
    return state;
  }
  if (command.kind === "rollback") {
    const spec = state.versions.find((value) => value.version === command.version)?.spec;
    if (!spec) throw new WorkspaceConflictError("That application version is unavailable.");
    if (spec.maintenanceOwner !== state.candidate.spec.maintenanceOwner) throw new WorkspaceConflictError("Changing maintenance responsibility requires an accepted handoff.");
    for (const record of state.records) validateRecord(spec, record);
    state.candidate = { designRevision: state.candidate.designRevision + 1, specVersion: state.candidate.specVersion + 1, spec, rehearsal: null };
    state.versions = appendVersion(state.versions, { version: state.candidate.specVersion, spec }, "This application has reached its candidate history limit.");
    state.status = "draft";
    return state;
  }
  if (command.kind === "submit") {
    const spec = releaseSpec(state);
    if (!spec || state.status === "retired") throw new WorkspaceConflictError("This application is not accepting records.");
    if (state.records.some((record) => record.id === command.record.id)) throw new WorkspaceConflictError("That record already exists.");
    if (state.records.length >= APPLICATION_RECORD_LIMIT) throw new WorkspaceConflictError("This application has reached its record limit.");
    validateRecord(spec, command.record);
    state.records = [...state.records, command.record];
    state.recordsRevision += 1;
    return state;
  }
  throw new WorkspaceConflictError("This application command is unavailable.");
}
