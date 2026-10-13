import "server-only";
import { z } from "zod";
import { getCapability, listCapabilities, type CapabilityEntry } from "@/capability-registry";
import type { CapabilityAvailabilityView, CapabilityEvidenceMode } from "@/platform/capabilities/inventory-contracts";
import {
  NO_VIEWER, releaseFlagEnvMode, resolveReleaseFlag, workspaceReleaseOn,
  type ReleaseEnvironment, type ReleaseViewer,
} from "@/platform/release-flags/resolve";
import { readWorkspaceReleaseFlags, rowStateFor, workspaceReleaseFlagsSchema, type WorkspaceReleaseFlags } from "@/platform/release-flags/store";

export interface CapabilityAvailabilityScope {
  workspaceId: string;
  viewer?: ReleaseViewer;
  /** Default production: local witnesses cannot make production available. */
  evidenceMode?: CapabilityEvidenceMode;
}

const prerequisiteObservationSchema = z.object({
  workspaceId: z.string().uuid(),
  capabilityKey: z.string().min(1),
  checks: z.array(z.object({
    id: z.string().min(1), state: z.enum(["satisfied", "missing", "unknown"]),
  }).strict()),
}).strict();
export type CapabilityPrerequisiteObservation = z.infer<typeof prerequisiteObservationSchema>;

export interface CapabilityAvailabilityReaders {
  /** Read-only owner adapter; no permission grant or effects belong here. */
  readPrerequisites?: (entry: CapabilityEntry, scope: CapabilityAvailabilityScope) => Promise<CapabilityPrerequisiteObservation>;
  readReleaseFlags?: (workspaceId: string) => Promise<WorkspaceReleaseFlags>;
  environment?: ReleaseEnvironment;
}

/**
 * One discovery projection for Workspace, Ask, MCP and operator adapters.
 * Always obtains qualification/policy from owner adapters; never from a caller's
 * serialized status or a commercial/installation label. This is not admission.
 * A failed scoped read is unknown, even where legacy boolean gates use env fallback.
 */
export async function capabilityAvailability(
  keys: readonly string[], scope: CapabilityAvailabilityScope, readers: CapabilityAvailabilityReaders = {},
): Promise<readonly CapabilityAvailabilityView[]> {
  const environment = readers.environment ?? process.env;
  const evidenceMode = scope.evidenceMode ?? "production";
  const validScope = z.string().uuid().safeParse(scope.workspaceId).success;
  const viewer = scope.viewer ?? NO_VIEWER;
  let flags: Promise<WorkspaceReleaseFlags | null> | undefined;
  function scopedFlags() {
    // One observation shared by every entry in this projection. No store mutation.
    flags ??= Promise.resolve().then(() => (readers.readReleaseFlags ?? readWorkspaceReleaseFlags)(scope.workspaceId))
      .then(value => {
        const parsed = workspaceReleaseFlagsSchema.safeParse(value);
        return parsed.success && parsed.data.workspaceId === scope.workspaceId ? parsed.data : null;
      }).catch(() => null);
    return flags;
  }
  function result(key: string, state: CapabilityAvailabilityView["state"], reason: CapabilityAvailabilityView["reason"], message: string): CapabilityAvailabilityView {
    return Object.freeze({ key, state, reason, message, evidenceMode, grantsAuthority: false });
  }
  async function project(key: string): Promise<CapabilityAvailabilityView> {
    const entry = getCapability(key);
    if (!entry) return result(key, "unknown", "unknown_capability", "This capability is not declared by an owner.");
    if (entry.contract.role === "descriptive") return result(key, "unavailable", "descriptive_only", "This is a product description; availability belongs to its executable or installable owner.");
    if (entry.availability.workspaceRelease && !workspaceReleaseOn(environment)) return result(key, "unavailable", "release_off", "The workspace release is off.");
    for (const flag of entry.availability.releaseFlags) {
      if (releaseFlagEnvMode(flag, environment) === "off") return result(key, "unavailable", "release_off", `The ${flag} release is off.`);
    }
    if (!validScope) return result(key, "unknown", "release_scope_unknown", "A valid business workspace is required to confirm availability.");
    if (entry.availability.releaseFlags.length) {
      const observed = await scopedFlags();
      if (!observed) return result(key, "unknown", "release_scope_unknown", "The scoped release state could not be confirmed.");
      const tester = Boolean(viewer.tester || (viewer.userId && observed.testers.includes(viewer.userId)));
      for (const flag of entry.availability.releaseFlags) {
        if (!resolveReleaseFlag({ workspaceRelease: workspaceReleaseOn(environment), env: releaseFlagEnvMode(flag, environment), row: rowStateFor(observed, flag), viewer: { operator: viewer.operator, tester } })) {
          return result(key, "unavailable", "release_off", `The ${flag} release is off for this business or viewer.`);
        }
      }
    }
    if (entry.availability.prerequisites.length) {
      let observation: CapabilityPrerequisiteObservation | null = null;
      try {
        const parsed = prerequisiteObservationSchema.safeParse(await readers.readPrerequisites?.(entry, scope));
        if (parsed.success && parsed.data.workspaceId === scope.workspaceId && parsed.data.capabilityKey === key && new Set(parsed.data.checks.map(check => check.id)).size === parsed.data.checks.length) observation = parsed.data;
      } catch { /* Owner read failure remains unknown. Do not log customer data. */ }
      const checks = entry.availability.prerequisites.map(id => ({ id, state: observation?.checks.find(check => check.id === id)?.state ?? "unknown" }));
      const missing = checks.find(check => check.state === "missing");
      if (missing) return result(key, "unavailable", "prerequisite_missing", `The owning module reports a missing prerequisite: ${missing.id}.`);
      const unknown = checks.find(check => check.state === "unknown");
      if (unknown) return result(key, "unknown", "prerequisite_unknown", `The owning module has not confirmed prerequisite: ${unknown.id}.`);
    }
    // Source existence is never execution qualification. Modes are independent:
    // local_test doesn't imply native/Auth/provider/production, nor the converse.
    if (evidenceMode === "source" || !entry.qualification.provenModes.includes(evidenceMode)) {
      return result(key, "unknown", "qualification_unknown", `The owner has no ${evidenceMode} execution qualification for this exact capability.`);
    }
    return result(key, "available", "qualified", `Owner qualification and prerequisites are confirmed for ${evidenceMode}; execution still requires current authority.`);
  }
  return Object.freeze(await Promise.all([...new Set(keys)].map(project)));
}

/** JSON values only; all surface adapters consume this identical shape. */
export async function capabilityAvailabilityView(scope: CapabilityAvailabilityScope, readers: CapabilityAvailabilityReaders = {}) {
  return capabilityAvailability(listCapabilities().map(entry => entry.key), scope, readers);
}
