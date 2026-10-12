/** Browser-safe inventory values. Import the server composition only on the server. */
export type CapabilityEvidenceMode = "source" | "local_test" | "local_native" | "local_auth" | "provider" | "production";
export type CapabilityContractRole = "executable" | "descriptive" | "installable" | "tenant_tools" | "dashboard";

export interface CapabilityEvidenceReference {
  readonly id: string;
  /** Exact inventory key, including the version when the owner versions it. */
  readonly capabilityKey: string;
  readonly reference: string;
  readonly mode: CapabilityEvidenceMode;
  readonly checkedAt: string | null;
}

export interface CapabilityQualificationView {
  readonly receiptReference: string | null;
  readonly evidence: readonly CapabilityEvidenceReference[];
  /** Explicit proof modes, never an ordinal readiness level. */
  readonly provenModes: readonly CapabilityEvidenceMode[];
}

export type CapabilityAvailabilityState = "available" | "unavailable" | "unknown";
export type CapabilityAvailabilityReason =
  | "qualified"
  | "unknown_capability"
  | "descriptive_only"
  | "release_off"
  | "release_scope_unknown"
  | "qualification_unknown"
  | "prerequisite_missing"
  | "prerequisite_unknown";

export interface CapabilityAvailabilityView {
  readonly key: string;
  readonly state: CapabilityAvailabilityState;
  readonly reason: CapabilityAvailabilityReason;
  readonly message: string;
  readonly evidenceMode: CapabilityEvidenceMode;
  /** Discovery values never admit a command, install, or outside write. */
  readonly grantsAuthority: false;
}
