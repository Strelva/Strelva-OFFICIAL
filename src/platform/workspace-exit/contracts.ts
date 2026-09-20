import { z } from "zod";

const uuid = z.string().uuid();
const instant = z.string().datetime({ offset: true });
const count = z.number().int().nonnegative();

export const workspaceExitCommandSchema = z.object({
  workspaceId: uuid,
  futureWork: z.enum(["pause", "cancel"]),
  providerParticipation: z.enum(["keep", "revoke"]),
  maintainedResources: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("stop") }).strict(),
    z.object({ kind: z.literal("successor"), successorUserId: uuid }).strict(),
  ]),
  notes: z.string().trim().max(1_000).optional(),
  idempotencyKey: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/),
}).strict();
export type WorkspaceExitCommand = z.infer<typeof workspaceExitCommandSchema>;

export const workspaceExitSummarySchema = z.object({
  standingPaused: count,
  standingRevoked: count,
  scheduledPaused: count,
  scheduledCancelled: count,
  assignmentsRevoked: count,
  providerDeliveriesRevoked: count,
  investigationsPaused: count,
  retainedAccepted: count,
  retainedUnknown: count,
}).strict();
export type WorkspaceExitSummary = z.infer<typeof workspaceExitSummarySchema>;

export const workspaceExitObligationSchema = z.object({
  workId: uuid,
  title: z.string().min(1).max(160),
  status: z.enum(["running", "waiting", "needs_attention", "accepted", "unknown"]),
  effect: z.enum(["none", "accepted", "unknown"]),
}).strict();

export const workspaceExitResourceSchema = z.object({
  kind: z.enum(["offering", "standing", "investigation", "native_application", "custom_application"]),
  id: uuid,
  status: z.enum(["successor_named", "stopped"]),
}).strict();

export const workspaceExitStateSchema = z.object({
  id: uuid,
  workspaceId: uuid,
  status: z.literal("completed"),
  requestedAt: instant,
  completedAt: instant,
  requestedBy: uuid,
  futureWork: z.enum(["paused", "cancelled"]),
  providerParticipation: z.enum(["kept", "revoked"]),
  maintainedResources: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("stopped") }).strict(),
    z.object({ kind: z.literal("successor"), successorUserId: uuid, successorEmail: z.string().email() }).strict(),
  ]),
  summary: workspaceExitSummarySchema,
  retainedObligations: z.array(workspaceExitObligationSchema).max(1_000),
  resources: z.array(workspaceExitResourceSchema).max(500),
}).strict();
export type WorkspaceExitState = z.infer<typeof workspaceExitStateSchema>;

export const workspaceExitSuccessorSchema = z.object({
  userId: uuid,
  email: z.string().email(),
}).strict();

export const workspaceExitOptionsSchema = z.object({
  state: workspaceExitStateSchema.nullable(),
  successors: z.array(workspaceExitSuccessorSchema).max(500),
}).strict();
export type WorkspaceExitOptions = z.infer<typeof workspaceExitOptionsSchema>;

export const workspaceExitResponseSchema = z.object({
  state: workspaceExitStateSchema,
  replayed: z.boolean(),
}).strict();
export type WorkspaceExitResponse = z.infer<typeof workspaceExitResponseSchema>;
