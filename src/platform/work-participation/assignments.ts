import { z } from "zod";
import type { Responsibility } from "@/platform/work-execution/engine";
import type { WorkspaceActor } from "@/platform/workspaces/types";

export const operationalAssigneeKindSchema = z.enum(["agency", "staff", "strelva", "agent"]);
export const operationalAssignmentStatusSchema = z.enum(["offered", "accepted", "revoked", "expired"]);
export const operationalAssignmentOfferSchema = z.object({
  assigneeEmail: z.string().trim().toLowerCase().email().max(254),
  assigneeKind: operationalAssigneeKindSchema,
  expiresAt: z.string().datetime({ offset: true }),
  idempotencyKey: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/),
}).strict();

export const operationalAssignmentSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  workId: z.string().uuid(),
  sponsorId: z.string().uuid(),
  sponsorEmail: z.string().email(),
  assigneeUserId: z.string().uuid(),
  assigneeEmail: z.string().email(),
  assigneeKind: operationalAssigneeKindSchema,
  scope: z.tuple([z.literal("operate")]),
  status: operationalAssignmentStatusSchema,
  offeredAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }),
  acceptedAt: z.string().datetime({ offset: true }).nullable(),
  revokedAt: z.string().datetime({ offset: true }).nullable(),
  revokedBy: z.string().uuid().nullable(),
});

export type OperationalAssignment = z.infer<typeof operationalAssignmentSchema>;
export type OperationalAssignmentOffer = z.infer<typeof operationalAssignmentOfferSchema>;

export interface AssignedResponsibility {
  assignment: OperationalAssignment;
  responsibility: {
    id: string;
    workspaceId: string;
    payload: Responsibility;
  };
}

export interface OperationalAssignmentStore {
  offer(actor: WorkspaceActor, workId: string, input: OperationalAssignmentOffer): Promise<OperationalAssignment>;
  accept(actor: WorkspaceActor, assignmentId: string): Promise<OperationalAssignment>;
  revoke(actor: WorkspaceActor, assignmentId: string): Promise<OperationalAssignment>;
  readForWork(actor: WorkspaceActor, workId: string): Promise<OperationalAssignment | null>;
  read(actor: WorkspaceActor, assignmentId: string, access?: "normal" | "checkpoint" | "inspect"): Promise<AssignedResponsibility>;
  checkpoint(
    actor: WorkspaceActor,
    assignmentId: string,
    expectedRevision: number,
    payload: Responsibility,
    phase: "start" | "outcome",
  ): Promise<Responsibility>;
}

export function createOperationalAssignmentService(store: OperationalAssignmentStore) {
  return {
    offer(actor: WorkspaceActor, workId: string, raw: unknown) {
      return store.offer(actor, z.string().uuid().parse(workId), operationalAssignmentOfferSchema.parse(raw));
    },
    accept(actor: WorkspaceActor, assignmentId: string) {
      return store.accept(actor, z.string().uuid().parse(assignmentId));
    },
    revoke(actor: WorkspaceActor, assignmentId: string) {
      return store.revoke(actor, z.string().uuid().parse(assignmentId));
    },
    readForWork(actor: WorkspaceActor, workId: string) {
      return store.readForWork(actor, z.string().uuid().parse(workId));
    },
    read(actor: WorkspaceActor, assignmentId: string, access: "normal" | "checkpoint" | "inspect" = "normal") {
      return store.read(actor, z.string().uuid().parse(assignmentId), access);
    },
  };
}
