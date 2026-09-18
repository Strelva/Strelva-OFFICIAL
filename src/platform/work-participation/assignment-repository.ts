import { z } from "zod";
import { getSupabase } from "@/lib/db/client";
import { responsibilitySchema } from "@/platform/work-execution/engine";
import {
  WorkspaceAccessError,
  WorkspaceConflictError,
  WorkspaceStoreError,
  type WorkspaceActor,
} from "@/platform/workspaces/types";
import {
  operationalAssignmentSchema,
  type AssignedResponsibility,
  type OperationalAssignment,
  type OperationalAssignmentOffer,
  type OperationalAssignmentStore,
} from "./assignments";

interface RpcClient {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>;
}

function client(): RpcClient {
  const db = getSupabase();
  if (!db) throw new WorkspaceStoreError("Operational assignment storage is unavailable.");
  return db as unknown as RpcClient;
}

function identity(actor: WorkspaceActor) {
  return {
    p_user_id: z.string().uuid().parse(actor.userId),
    p_verified_email: z.string().email().parse(actor.verifiedEmail.toLowerCase()),
  };
}

function fail(error: { message: string } | null): void {
  if (!error) return;
  if (/workspace_access_denied|operational_assignment_denied/.test(error.message)) throw new WorkspaceAccessError();
  if (/operational_assignment_conflict|responsibility_revision_conflict|operational_assignment_expired/.test(error.message)) {
    throw new WorkspaceConflictError("This assignment or its approved work changed. Reload before continuing.");
  }
  throw new WorkspaceStoreError("The operational assignment change could not be confirmed.");
}

function one(raw: unknown): Record<string, unknown> {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new WorkspaceStoreError("The operational assignment was not returned.");
  }
  return value as Record<string, unknown>;
}

function assignment(raw: unknown): OperationalAssignment {
  const value = one(raw);
  return operationalAssignmentSchema.parse({
    id: value.id,
    workspaceId: value.workspace_id,
    workId: value.work_id,
    sponsorId: value.sponsor_id,
    sponsorEmail: value.sponsor_email,
    assigneeUserId: value.assignee_user_id,
    assigneeEmail: value.assignee_email,
    assigneeKind: value.assignee_kind,
    scope: value.scope,
    status: value.status,
    offeredAt: value.offered_at,
    expiresAt: value.expires_at,
    acceptedAt: value.accepted_at ?? null,
    revokedAt: value.revoked_at ?? null,
    revokedBy: value.revoked_by ?? null,
  });
}

function optionalAssignment(raw: unknown): OperationalAssignment | null {
  if (Array.isArray(raw) && raw.length === 0) return null;
  if (raw === null) return null;
  return assignment(raw);
}

function assigned(raw: unknown): AssignedResponsibility {
  const value = one(raw);
  return {
    assignment: assignment(value.assignment),
    responsibility: z.object({
      id: z.string().uuid(),
      workspaceId: z.string().uuid(),
      payload: responsibilitySchema,
    }).parse(value.responsibility),
  };
}

export const postgresOperationalAssignments: OperationalAssignmentStore = {
  async offer(actor, workId, input: OperationalAssignmentOffer) {
    const { data, error } = await client().rpc("offer_operational_assignment", {
      ...identity(actor),
      p_work_id: workId,
      p_assignee_email: input.assigneeEmail,
      p_assignee_kind: input.assigneeKind,
      p_expires_at: input.expiresAt,
      p_idempotency_key: input.idempotencyKey,
    });
    fail(error);
    return assignment(data);
  },
  async accept(actor, assignmentId) {
    const { data, error } = await client().rpc("accept_operational_assignment", {
      ...identity(actor), p_assignment_id: assignmentId,
    });
    fail(error);
    return assignment(data);
  },
  async revoke(actor, assignmentId) {
    const { data, error } = await client().rpc("revoke_operational_assignment", {
      ...identity(actor), p_assignment_id: assignmentId,
    });
    fail(error);
    return assignment(data);
  },
  async readForWork(actor, workId) {
    const { data, error } = await client().rpc("read_operational_assignment_for_work", {
      ...identity(actor), p_work_id: workId,
    });
    fail(error);
    return optionalAssignment(data);
  },
  async read(actor, assignmentId, access = "normal") {
    const { data, error } = await client().rpc("read_operational_assignment", {
      ...identity(actor), p_assignment_id: assignmentId, p_access: access,
    });
    fail(error);
    return assigned(data);
  },
  async checkpoint(actor, assignmentId, expectedRevision, payload, phase) {
    const { data, error } = await client().rpc("checkpoint_operational_assignment", {
      ...identity(actor),
      p_assignment_id: assignmentId,
      p_expected_revision: expectedRevision,
      p_payload: payload,
      p_phase: phase,
    });
    fail(error);
    return responsibilitySchema.parse(one(data).payload);
  },
};
