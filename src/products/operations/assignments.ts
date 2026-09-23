import { agencyAssignedWorkAccess } from "@/platform/workspaces/repository";
import { isSuperAdminUser } from "@/lib/db/repositories";
import { WorkspaceAccessError, WorkspaceConflictError, type WorkspaceActor } from "@/platform/workspaces/types";
import { responsibilityCommands } from "@/platform/work-execution/runtime";
import { readResponsibility } from "@/platform/work-execution/repository";
import { type Responsibility } from "@/platform/work-execution/engine";
import { createOperationalAssignmentService, postgresOperationalAssignments, type AssignedResponsibility } from "@/platform/work-participation";
import { selectedRunnerCapability, rawRecord, type NativeExecutionGuard, createNativeExecutionAdapter } from "./native-execution";

const operationalAssignments = createOperationalAssignmentService(postgresOperationalAssignments);

export function assertOperationalAssignmentScope(payload: Responsibility, requireRunnable = false): void {
  if (!payload.approvedAt || payload.approvedBy !== payload.ownerId) {
    throw new WorkspaceConflictError("The owner must approve this exact work before assigning it.");
  }
  if (payload.budgetId || payload.steps.some((step) => step.maximumCents !== 0)) {
    throw new WorkspaceConflictError("Paid work cannot be delegated through an operational assignment.");
  }
  if (requireRunnable && !["ready", "waiting"].includes(payload.status)) {
    throw new WorkspaceConflictError("Only ready or waiting work can be assigned to an operator.");
  }
  for (const step of payload.steps) {
    const capability = selectedRunnerCapability(step);
    const definition = capability.definition;
    const input = rawRecord(step.input);
    if (definition.cost.mode !== "none" || definition.cost.source !== "native_local"
      || definition.cost.maximumCents !== 0 || definition.execution.effect === "external_side_effect"
      || definition.support === "internal_only" || definition.support === "managed_only"
      || !["document.edit", "tracker.command", "investigation.run", "schedule.command", "application.command", "website.draft"].includes(definition.id)
      || (definition.id === "application.command" && !["revise", "rehearse", "install"].includes(String(input.kind)))
      || (definition.id === "website.draft" && (input.kind !== "draft" || typeof input.bindingId !== "string" || input.bindingId !== step.workId || typeof input.section !== "string"))
      || (definition.id === "tracker.command" && input.kind === "coordinate_records")) {
      throw new WorkspaceConflictError(`The operation ${definition.id}@${definition.version} cannot be delegated.`);
    }
  }
}

async function assignedSnapshot(
  actor: WorkspaceActor,
  assignmentId: string,
  access: "normal" | "checkpoint" | "inspect" = "normal",
  requireProviderDelivery = true,
) {
  const saved = await operationalAssignments.read(actor, assignmentId, access);
  if (requireProviderDelivery && saved.assignment.assigneeKind === "agency"
    && !(await agencyAssignedWorkAccess(actor, saved.responsibility.workspaceId, saved.responsibility.id))) {
    throw new WorkspaceAccessError();
  }
  if (saved.assignment.assigneeKind === "strelva" && saved.assignment.assigneeUserId === actor.userId
    && !(await isSuperAdminUser(actor.userId))) {
    throw new WorkspaceAccessError();
  }
  assertOperationalAssignmentScope(saved.responsibility.payload);
  return saved;
}

function assignedCommands(assignmentId: string) {
  const guard: NativeExecutionGuard = async (actor, workspaceId, responsibilityId, step) => {
    const current = await assignedSnapshot(actor, assignmentId);
    if (current.responsibility.id !== responsibilityId || current.responsibility.workspaceId !== workspaceId
      || !current.responsibility.payload.steps.some((candidate) => candidate.id === step.id
        && candidate.operation === step.operation && candidate.workId === step.workId)) {
      throw new WorkspaceAccessError();
    }
  };
  const store = {
    async read(actor: WorkspaceActor, _reference: string, access: "normal" | "checkpoint" = "normal") {
      return (await operationalAssignments.read(actor, assignmentId, access)).responsibility;
    },
    async write(
      actor: WorkspaceActor,
      _reference: string,
      workspaceId: string,
      expectedRevision: number,
      payload: Responsibility,
      phase: "command" | "start" | "outcome" = "command",
    ) {
      if (phase === "command") throw new WorkspaceAccessError("Operational assignments cannot change approval, budget, or recovery decisions.");
      const current = await operationalAssignments.read(actor, assignmentId, phase === "outcome" ? "checkpoint" : "normal");
      if (current.responsibility.workspaceId !== workspaceId) throw new WorkspaceAccessError();
      return postgresOperationalAssignments.checkpoint(actor, assignmentId, expectedRevision, payload, phase);
    },
    async create() { throw new WorkspaceAccessError("Operational assignments cannot create work."); },
  };
  return responsibilityCommands(store, createNativeExecutionAdapter(guard), () => new Date().toISOString(), async (actor, saved) => {
    const current = await assignedSnapshot(actor, assignmentId);
    if (current.responsibility.id !== saved.id || current.responsibility.payload.ownerId === actor.userId) {
      throw new WorkspaceAccessError();
    }
  });
}

export async function offerOperationalAssignment(actor: WorkspaceActor, workId: string, input: unknown) {
  const saved = await readResponsibility(actor, workId);
  if (saved.payload.ownerId !== actor.userId) throw new WorkspaceAccessError();
  assertOperationalAssignmentScope(saved.payload, true);
  return operationalAssignments.offer(actor, workId, input);
}

export async function acceptOperationalAssignment(actor: WorkspaceActor, assignmentId: string) {
  // The provider delivery acceptance path accepts the assignment first, then
  // accepts the delivery. Requiring an already accepted delivery here would
  // create a circular prerequisite.
  await assignedSnapshot(actor, assignmentId, "inspect", false);
  return operationalAssignments.accept(actor, assignmentId);
}

export async function revokeOperationalAssignment(actor: WorkspaceActor, assignmentId: string) {
  return operationalAssignments.revoke(actor, assignmentId);
}

export async function inspectOperationalAssignmentForWork(actor: WorkspaceActor, workId: string) {
  const saved = await readResponsibility(actor, workId);
  if (saved.payload.ownerId !== actor.userId) throw new WorkspaceAccessError();
  return operationalAssignments.readForWork(actor, workId);
}

export async function inspectOperationalAssignment(actor: WorkspaceActor, assignmentId: string): Promise<AssignedResponsibility> {
  const saved = await operationalAssignments.read(actor, assignmentId, "inspect");
  assertOperationalAssignmentScope(saved.responsibility.payload);
  return saved;
}

export async function runOperationalAssignment(actor: WorkspaceActor, assignmentId: string) {
  const responsibility = await assignedCommands(assignmentId).run(actor, assignmentId);
  return { assignmentId, responsibility };
}
