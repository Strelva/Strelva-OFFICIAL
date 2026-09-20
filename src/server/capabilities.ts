import { z } from "zod";
import {
  applicationCommandSchema,
  applicationSchema,
  applicationSpecSchema,
} from "@/products/applications/contracts";
import {
  documentCommandSchema,
  documentSchema,
  documentContentSchema,
} from "@/products/documents/contracts";
import { investigationSchema } from "@/products/investigations/contracts";
import {
  scheduleCommandSchema,
  scheduleSchema,
} from "@/products/scheduling/contracts";
import { trackerCommandSchema } from "@/products/tracker/contracts";
import type {
  CapabilityAuthority,
  CapabilityCost,
  CapabilityEntrance,
  CapabilityIdempotency,
  CapabilityQualificationEvidence,
  ExecutableCapabilityDefinition,
} from "@/platform/capabilities";
import { createCapabilityRegistry, qualifyCapability } from "@/platform/capabilities";

const anyObjectSchema = z.record(z.string(), z.unknown());

/** Input accepted by the plan-output application builder. Ownership is added by the server. */
export const applicationCapabilityInputSchema = z.object({
  title: applicationSpecSchema.shape.title,
  fields: applicationSpecSchema.shape.fields,
  components: applicationSpecSchema.shape.components,
}).strict().superRefine((spec, ctx) => {
  const ids = new Set(spec.fields.map((field) => field.id));
  if (ids.size !== spec.fields.length) {
    ctx.addIssue({ code: "custom", message: "Field names must be unique", path: ["fields"] });
  }
  if (spec.components.some((component) => component.fields.some((id) => !ids.has(id)))) {
    ctx.addIssue({ code: "custom", message: "Components may only reference declared fields", path: ["components"] });
  }
});

/** The plan-output tracker builder accepts only one of the native empty templates. */
export const trackerCapabilityInputSchema = z.object({
  templateId: z.enum(["tasks", "projects", "inventory"]),
  title: z.string().trim().min(1).max(160).optional(),
}).strict();

export const investigationRunCapabilityInputSchema = z.object({
  /** The native runner may derive both guards from its current target and lease. */
  expectedRevision: z.number().int().nonnegative().optional(),
  requestId: z.string().trim().min(1).max(100).optional(),
}).strict();

export const learningCollectCapabilityInputSchema = z.object({
  /** Collection derives the current revision after the runner recheck. */
  expectedRevision: z.number().int().nonnegative().optional(),
}).strict();

function definition<TInput, TResult>(
  value: Omit<ExecutableCapabilityDefinition<TInput, TResult>, "contractVersion">,
): ExecutableCapabilityDefinition<TInput, TResult> {
  return Object.freeze({
    contractVersion: 1 as const,
    ...value,
  });
}

const nativeAuthority: CapabilityAuthority = {
  requirements: ["workspace_membership", "resource_owner"],
  approval: "operation_policy",
  recheckAtExecution: true,
  scope: "same_workspace",
};
const nativeCost: CapabilityCost = {
  mode: "none",
  currency: "usd",
  estimateCents: 0,
  maximumCents: 0,
  source: "native_local",
};
const nativeIdempotency: CapabilityIdempotency = {
  mode: "native_command",
  retry: "safe",
  keyFields: ["workId", "expectedRevision"],
};
const nativePolicy = {
  authority: nativeAuthority,
  cost: nativeCost,
  idempotency: nativeIdempotency,
  reconciliation: {
    mode: "read_back" as const,
    acceptedWriteClosed: true as const,
  },
  verification: {
    mode: "read_back" as const,
    evidence: "read_back" as const,
  },
};

const planAuthority: CapabilityAuthority = {
  requirements: ["workspace_membership", "resource_owner"],
  approval: "operation_policy",
  recheckAtExecution: true,
  scope: "same_workspace",
};
const planCost: CapabilityCost = {
  mode: "none",
  currency: "usd",
  estimateCents: null,
  maximumCents: 0,
  source: "native_local",
};
const planIdempotency: CapabilityIdempotency = {
  mode: "work_plan_output",
  retry: "safe",
  keyFields: ["planWorkId", "planRevision", "outputId"],
};
const planOutputPolicy = {
  authority: planAuthority,
  cost: planCost,
  idempotency: planIdempotency,
  reconciliation: {
    mode: "native_receipt" as const,
    acceptedWriteClosed: true as const,
  },
  verification: {
    mode: "native_receipt" as const,
    evidence: "local_receipt" as const,
  },
};

const compatible = (
  inputVersion: number,
  outputVersion: number,
  resourceKind: string,
  entrances: readonly CapabilityEntrance[],
) => ({
  contractVersion: 1 as const,
  inputVersion,
  outputVersion,
  resourceKinds: [resourceKind],
  entrances: [...entrances],
  status: "compatible" as const,
  notes: "The native product command remains the compatibility and authorization boundary.",
});

const createApplication = definition({
  id: "create_application",
  version: 1,
  family: "applications",
  productId: "applications",
  resourceKind: "application",
  label: "Create a private application",
  description: "Create an actor-owned application from approved fields and components.",
  support: "release_gated",
  owningScope: "workspace",
  authority: planOutputPolicy.authority,
  cost: planOutputPolicy.cost,
  execution: {
    effect: "create_resource",
    idempotency: planOutputPolicy.idempotency,
    reconciliation: planOutputPolicy.reconciliation,
    verification: planOutputPolicy.verification,
  },
  adapterKey: "applications.create_draft",
  entrances: ["planner", "api", "contextual"] as const,
  compatibility: compatible(1, 1, "application", ["planner", "api", "contextual"]),
  inputSchema: applicationCapabilityInputSchema,
  resultSchema: applicationSchema,
});

const applicationCommand = definition({
  id: "application.command",
  version: 1,
  family: "applications",
  productId: "applications",
  resourceKind: "application",
  label: "Change an application",
  description: "Apply a validated native application command to an owned application.",
  support: "release_gated",
  owningScope: "resource",
  authority: nativePolicy.authority,
  cost: nativePolicy.cost,
  execution: {
    effect: "propose_change",
    idempotency: nativePolicy.idempotency,
    reconciliation: nativePolicy.reconciliation,
    verification: nativePolicy.verification,
  },
  adapterKey: "applications.command",
  entrances: ["runner", "api", "contextual"] as const,
  compatibility: compatible(1, 1, "application", ["runner", "api", "contextual"]),
  inputSchema: applicationCommandSchema,
  resultSchema: applicationSchema,
});

const createDocument = definition({
  id: "create_document",
  version: 1,
  family: "documents",
  productId: "documents",
  resourceKind: "document",
  label: "Create a private document",
  description: "Create private text through the native document command boundary.",
  support: "release_gated",
  owningScope: "workspace",
  authority: planOutputPolicy.authority,
  cost: planOutputPolicy.cost,
  execution: {
    effect: "create_resource",
    idempotency: planOutputPolicy.idempotency,
    reconciliation: planOutputPolicy.reconciliation,
    verification: planOutputPolicy.verification,
  },
  adapterKey: "documents.create",
  entrances: ["planner", "api", "contextual"] as const,
  compatibility: compatible(1, 1, "document", ["planner", "api", "contextual"]),
  inputSchema: documentContentSchema,
  resultSchema: documentSchema,
});

const documentEdit = definition({
  id: "document.edit",
  version: 1,
  family: "documents",
  productId: "documents",
  resourceKind: "document",
  label: "Edit a private document",
  description: "Apply a revision-checked native document edit.",
  support: "release_gated",
  owningScope: "resource",
  authority: nativePolicy.authority,
  cost: nativePolicy.cost,
  execution: {
    effect: "propose_change",
    idempotency: nativePolicy.idempotency,
    reconciliation: nativePolicy.reconciliation,
    verification: nativePolicy.verification,
  },
  adapterKey: "documents.edit",
  entrances: ["runner", "api", "contextual"] as const,
  compatibility: compatible(1, 1, "document", ["runner", "api", "contextual"]),
  inputSchema: documentCommandSchema,
  resultSchema: documentSchema,
});

const createTracker = definition({
  id: "create_tracker",
  version: 1,
  family: "tracker",
  productId: "tracker",
  resourceKind: "tracker",
  label: "Create a tracker",
  description: "Create a workspace tracker from a supported empty template.",
  support: "supported",
  owningScope: "workspace",
  authority: planOutputPolicy.authority,
  cost: planOutputPolicy.cost,
  execution: {
    effect: "create_resource",
    idempotency: planOutputPolicy.idempotency,
    reconciliation: planOutputPolicy.reconciliation,
    verification: planOutputPolicy.verification,
  },
  adapterKey: "tracker.create",
  entrances: ["planner", "api", "contextual"] as const,
  compatibility: compatible(1, 1, "tracker", ["planner", "api", "contextual"]),
  inputSchema: trackerCapabilityInputSchema,
  resultSchema: anyObjectSchema,
});

const trackerCommand = definition({
  id: "tracker.command",
  version: 1,
  family: "tracker",
  productId: "tracker",
  resourceKind: "tracker",
  label: "Change tracker data",
  description: "Apply an attributable, revision-checked tracker command.",
  support: "supported",
  owningScope: "resource",
  authority: nativePolicy.authority,
  cost: nativePolicy.cost,
  execution: {
    effect: "propose_change",
    idempotency: nativePolicy.idempotency,
    reconciliation: nativePolicy.reconciliation,
    verification: nativePolicy.verification,
  },
  adapterKey: "tracker.command",
  entrances: ["runner", "api", "contextual"] as const,
  compatibility: compatible(1, 1, "tracker", ["runner", "api", "contextual"]),
  inputSchema: trackerCommandSchema,
  resultSchema: anyObjectSchema,
});

const scheduleCommand = definition({
  id: "schedule.command",
  version: 1,
  family: "scheduling",
  productId: "scheduling",
  resourceKind: "schedule",
  label: "Change a schedule",
  description: "Apply a native schedule reservation, reschedule, or cancellation command.",
  support: "release_gated",
  owningScope: "resource",
  authority: nativePolicy.authority,
  cost: nativePolicy.cost,
  execution: {
    effect: "propose_change",
    idempotency: nativePolicy.idempotency,
    reconciliation: { mode: "read_back", acceptedWriteClosed: true },
    verification: { mode: "read_back", evidence: "read_back" },
  },
  adapterKey: "scheduling.command",
  entrances: ["runner", "api", "contextual"] as const,
  compatibility: compatible(1, 1, "schedule", ["runner", "api", "contextual"]),
  inputSchema: scheduleCommandSchema,
  resultSchema: scheduleSchema,
});

const investigationRun = definition({
  id: "investigation.run",
  version: 1,
  family: "investigations",
  productId: "investigations",
  resourceKind: "investigation",
  label: "Run a source check",
  description: "Compare two permitted sources and record agreement or differences.",
  support: "release_gated",
  owningScope: "resource",
  authority: nativePolicy.authority,
  cost: nativePolicy.cost,
  execution: {
    effect: "create_resource",
    idempotency: nativePolicy.idempotency,
    reconciliation: nativePolicy.reconciliation,
    verification: nativePolicy.verification,
  },
  adapterKey: "investigations.run",
  entrances: ["runner", "api", "schedule", "contextual"] as const,
  compatibility: compatible(1, 1, "investigation", ["runner", "api", "schedule", "contextual"]),
  inputSchema: investigationRunCapabilityInputSchema,
  resultSchema: investigationSchema,
});

const learningCollect = definition({
  id: "learning.collect",
  version: 1,
  family: "product-learning",
  productId: "product-learning",
  resourceKind: "learning",
  label: "Collect internal research evidence",
  description: "Collect evidence for an internal R&D responsibility within its source limits.",
  support: "internal_only",
  owningScope: "resource",
  authority: {
    requirements: ["workspace_membership", "resource_owner", "super_admin"] as const,
    approval: "operation_policy",
    recheckAtExecution: true,
    scope: "same_workspace",
  },
  cost: {
    mode: "budget_required",
    currency: "usd",
    estimateCents: null,
    maximumCents: null,
    source: "unknown",
  },
  execution: {
    effect: "create_resource",
    idempotency: {
      mode: "native_command",
      retry: "reconcile_only",
      keyFields: ["workId", "expectedRevision"],
    },
    reconciliation: { mode: "read_back", acceptedWriteClosed: true },
    verification: { mode: "read_back", evidence: "read_back" },
  },
  adapterKey: "product-learning.collect",
  entrances: ["runner", "schedule", "contextual"] as const,
  compatibility: compatible(1, 1, "learning", ["runner", "schedule", "contextual"]),
  inputSchema: learningCollectCapabilityInputSchema,
  resultSchema: anyObjectSchema,
});

/**
 * All current operation entrances live here. Product catalog records remain
 * descriptive and do not make an entry executable.
 */
export const EXECUTABLE_CAPABILITY_DEFINITIONS = Object.freeze([
  createApplication,
  applicationCommand,
  createDocument,
  documentEdit,
  createTracker,
  trackerCommand,
  scheduleCommand,
  investigationRun,
  learningCollect,
] as const);

const evidence = (
  id: string,
  capabilityId: string,
  summary: string,
  reference: string,
  environment: "local" | "preview" | "production" | "external" = "local",
): CapabilityQualificationEvidence => ({
  id,
  capabilityId,
  capabilityVersion: 1,
  kind: "focused_test",
  environment,
  status: "passed",
  reference,
  checkedAt: "2026-09-14T00:00:00.000Z",
  summary,
});

/**
 * These are local qualification witnesses. They establish no provider,
 * production, deployment, or customer adoption result.
 */
export const EXECUTABLE_CAPABILITY_QUALIFICATIONS = Object.freeze([
  qualifyCapability(createApplication, [evidence("applications-plan", "create_application", "A reviewed plan creates one actor-owned draft.", "src/__tests__/work-plan-application.test.ts")], "2026-09-14T00:00:00.000Z", "Local native application planning and draft creation proof."),
  qualifyCapability(applicationCommand, [evidence("applications-command", "application.command", "Application rehearsal and installation use the native command.", "src/__tests__/horizontal-work-routes.test.ts")], "2026-09-14T00:00:00.000Z", "Local native application command proof."),
  qualifyCapability(createDocument, [evidence("documents-plan", "create_document", "A reviewed plan creates a private document.", "src/__tests__/work-plan-execution.test.ts")], "2026-09-14T00:00:00.000Z", "Local native document planning proof."),
  qualifyCapability(documentEdit, [evidence("documents-command", "document.edit", "A responsibility invokes the revision-checked document command.", "src/__tests__/work-execution.test.ts")], "2026-09-14T00:00:00.000Z", "Local native document command proof."),
  qualifyCapability(createTracker, [evidence("tracker-plan", "create_tracker", "A reviewed plan creates an empty supported tracker.", "src/__tests__/work-plan-execution.test.ts")], "2026-09-14T00:00:00.000Z", "Local native tracker planning proof."),
  qualifyCapability(trackerCommand, [evidence("tracker-command", "tracker.command", "A responsibility invokes the revision-checked tracker command.", "src/__tests__/work-execution.test.ts")], "2026-09-14T00:00:00.000Z", "Local native tracker command proof."),
  qualifyCapability(scheduleCommand, [evidence("schedule-command", "schedule.command", "Schedule commands reject overlap, preserve reservation identity through reschedule, and keep provider work governed.", "src/__tests__/bounded-scheduling.test.ts")], "2026-09-19T00:00:00.000Z", "Local native scheduling command proof."),
  qualifyCapability(investigationRun, [evidence("investigation-run", "investigation.run", "Investigation runs retain source snapshots and differences.", "src/__tests__/bounded-investigations.test.ts")], "2026-09-14T00:00:00.000Z", "Local native investigation proof."),
  qualifyCapability(learningCollect, [evidence("learning-collect", "learning.collect", "Internal collection keeps evidence within its registered source set.", "src/__tests__/product-learning-service.test.ts")], "2026-09-14T00:00:00.000Z", "Local internal R&D collection proof."),
] as const);

export type NativeExecutableCapability = (typeof EXECUTABLE_CAPABILITY_DEFINITIONS)[number];

/** Server composition of product-owned schemas with the generic capability registry. */
export const executableCapabilityRegistry = createCapabilityRegistry({
  definitions: EXECUTABLE_CAPABILITY_DEFINITIONS,
  qualifications: EXECUTABLE_CAPABILITY_QUALIFICATIONS,
});

export function getExecutableCapability(id: string, version?: number) {
  return executableCapabilityRegistry.get(id, version);
}

export function requireExecutableCapability(id: string, version?: number, entrance?: CapabilityEntrance) {
  return executableCapabilityRegistry.require(id, version, entrance);
}

export function requireExactExecutableCapability(id: string, version: number, entrance?: CapabilityEntrance) {
  return executableCapabilityRegistry.requireExact(id, version, entrance);
}

export function listExecutableCapabilities(entrance?: CapabilityEntrance) {
  return executableCapabilityRegistry.list(entrance);
}

export function listExecutableCapabilityDescriptors(entrance?: CapabilityEntrance) {
  return executableCapabilityRegistry.listDescriptors(entrance);
}
