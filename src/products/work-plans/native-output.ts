import { z } from "zod";
import { CapabilityUnavailableError, type QualifiedExecutableCapability } from "@/platform/capabilities";
import { listExecutableCapabilityDescriptors, requireExactExecutableCapability } from "@/server/capabilities";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { type PersistWorkPlanOutputInput, type WorkspaceActor } from "@/platform/workspaces";
import { createApplicationDraft } from "@/products/applications/server";
import { workPlanApplicationDraftSchema } from "./contracts";
import { createDocument, documentContentSchema } from "@/products/documents/contracts";
import { createTrackerFromImport, trackerWorkPayload } from "@/products/tracker";
import { trackerTemplateSource } from "@/products/tracker/client";
import { type WorkPlan, type WorkPlanNativeOperation } from "./contracts";
import { WorkPlanInvalidOutputError, WorkPlanExecutionUnsupportedError } from "./errors";
import { draftInputs } from "./domain";

export function nativeOperationCatalog(): WorkPlanNativeOperation[] {
  return listExecutableCapabilityDescriptors("planner")
    .filter((capability) => capability.support === "supported" ||
      (capability.support === "release_gated" && workspaceReleaseEnabled()))
    .map((capability) => ({
      id: capability.id,
      capabilityVersion: capability.version,
      productId: capability.productId,
      resourceKind: capability.resourceKind,
      label: capability.label,
      effect: capability.effect,
      support: capability.support === "release_gated" ? "release_gated" as const : "supported" as const,
      description: capability.description,
    }));
}

const trackerOutputInputSchema = z.object({
  templateId: z.enum(["tasks", "projects", "inventory"]),
  title: z.string().trim().min(1).max(160).optional(),
}).strict();

function trackerIdFor(planWorkId: string, outputId: string): string {
  // Tracker IDs are product data, not persistence keys. Keep the generated
  // value stable across retries so a replay never proposes a second identity.
  return `plan-${planWorkId}-${outputId}`.slice(0, 200);
}

export function selectedOperation(
  plan: WorkPlan,
  output: WorkPlan["proposedOutputs"][number],
  requested: string | undefined,
): QualifiedExecutableCapability {
  const operationId = requested || (output.nativeOperationIds.length === 1 ? output.nativeOperationIds[0] : undefined);
  if (!operationId || !output.nativeOperationIds.includes(operationId)) {
    throw new WorkPlanExecutionUnsupportedError(operationId || "multiple_operations");
  }
  const described = plan.supportedNativeOperations.find((operation) => operation.id === operationId);
  if (!described || described.effect !== "create_resource") {
    throw new WorkPlanExecutionUnsupportedError(operationId);
  }
  const capabilityVersion = described.capabilityVersion ?? 1;
  let capability;
  try {
    capability = requireExactExecutableCapability(operationId, capabilityVersion, "planner");
  } catch (error) {
    if (error instanceof CapabilityUnavailableError) throw new WorkPlanExecutionUnsupportedError(operationId);
    throw error;
  }
  if (capability.definition.productId !== described.productId ||
      capability.definition.resourceKind !== described.resourceKind ||
      capability.definition.execution.effect !== described.effect) {
    throw new WorkPlanExecutionUnsupportedError(operationId);
  }
  if (capability.definition.support === "release_gated" && !workspaceReleaseEnabled()) {
    throw new WorkPlanExecutionUnsupportedError(operationId);
  }
  return capability;
}

export function buildNativeOutput(input: {
  actor: WorkspaceActor;
  planWorkId: string;
  outputId: string;
  capability: QualifiedExecutableCapability;
  output: WorkPlan["proposedOutputs"][number];
  inputs: Record<string, unknown>;
}): Pick<PersistWorkPlanOutputInput, "nativeProductId" | "nativeResourceKind" | "nativeTitle" | "nativePayload" | "nativeInput"> {
  const values = draftInputs(input.output, input.inputs, input.capability.definition.adapterKey);
  if (input.capability.definition.adapterKey === "applications.create_draft") {
    if (input.output.draft?.kind !== "application") throw new WorkPlanInvalidOutputError("The application output needs a reviewable application draft.");
    const parsed = workPlanApplicationDraftSchema.safeParse({ ...values, kind: "application" });
    if (!parsed.success) throw new WorkPlanInvalidOutputError("Review the application's fields and approved views before accepting it.");
    const { kind: _kind, ...spec } = parsed.data;
    const application = createApplicationDraft({ ...spec, maintenanceOwner: input.actor.userId }, input.actor);
    return { nativeProductId: "applications", nativeResourceKind: "application", nativeTitle: application.title, nativePayload: application, nativeInput: spec };
  }
  if (input.capability.definition.adapterKey === "documents.create") {
    if (input.output.draft?.kind !== "document") {
      throw new WorkPlanInvalidOutputError("The document output needs a reviewable document draft.");
    }
    const parsed = documentContentSchema.strict().safeParse(values);
    if (!parsed.success) throw new WorkPlanInvalidOutputError("Review the document title and text before accepting it.");
    const document = createDocument(parsed.data, input.actor.userId);
    return {
      nativeProductId: "documents",
      nativeResourceKind: "document",
      nativeTitle: document.title,
      nativePayload: document,
      nativeInput: parsed.data,
    };
  }

  if (input.capability.definition.adapterKey !== "tracker.create" || input.output.draft?.kind !== "tracker") {
    throw new WorkPlanInvalidOutputError("The tracker output needs a reviewable empty-template draft.");
  }
  const parsed = trackerOutputInputSchema.safeParse(values);
  if (!parsed.success) throw new WorkPlanInvalidOutputError("Choose a supported empty tracker template before accepting it.");
  const template = trackerTemplateSource(parsed.data.templateId);
  const tracker = createTrackerFromImport(template, {
    trackerId: trackerIdFor(input.planWorkId, input.outputId),
    actorId: input.actor.userId,
    ...(parsed.data.title ? { title: parsed.data.title } : {}),
  });
  return {
    nativeProductId: "tracker",
    nativeResourceKind: "tracker",
    nativeTitle: tracker.title,
    nativePayload: trackerWorkPayload(tracker),
    nativeInput: parsed.data,
  };
}
