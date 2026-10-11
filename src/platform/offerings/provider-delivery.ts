import { createHash } from "node:crypto";
import { z } from "zod";
import type { OfferingActor, OfferingInstallation } from "./types";
import { OfferingAccessError, OfferingConflictError, OfferingNotFoundError, OfferingValidationError } from "./types";
import type { OperationalAssignment } from "@/platform/work-participation";

export const agencyDeliveryStatusSchema = z.enum(["requested", "accepted", "revoked"]);
export const agencyDeliveryDecisionSchema = z.enum(["pending", "confirmed", "changes_requested"]);
export const agencyDeliverySchema = z.object({
  id: z.string().uuid(),
  businessId: z.string().uuid(),
  installationId: z.string().uuid(),
  assignmentId: z.string().uuid(),
  status: agencyDeliveryStatusSchema,
  customerDecision: agencyDeliveryDecisionSchema,
  revision: z.number().int().positive(),
  scope: z.array(z.string().min(1)).min(1),
  requestedBy: z.string().uuid(),
  requestedAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }),
  acceptedBy: z.string().uuid().nullable(),
  acceptedAt: z.string().datetime({ offset: true }).nullable(),
  revokedBy: z.string().uuid().nullable(),
  revokedAt: z.string().datetime({ offset: true }).nullable(),
  revocationReason: z.string().nullable(),
  decidedBy: z.string().uuid().nullable(),
  decidedAt: z.string().datetime({ offset: true }).nullable(),
  decisionNote: z.string().nullable(),
  history: z.array(z.object({
    kind: z.enum(["requested", "accepted", "revoked", "confirmed", "changes_requested"]),
    actorId: z.string().uuid(),
    at: z.string().datetime({ offset: true }),
    note: z.string().nullable(),
  })),
});

export type AgencyDelivery = z.infer<typeof agencyDeliverySchema>;

const requestSchema = z.object({
  action: z.literal("request"),
  businessId: z.string().uuid(),
  installationId: z.string().uuid(),
  assignmentId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/),
}).strict();
const acceptSchema = z.object({ action: z.literal("accept"), deliveryId: z.string().uuid() }).strict();
const revokeSchema = z.object({
  action: z.literal("revoke"), deliveryId: z.string().uuid(), expectedRevision: z.number().int().positive(),
  reason: z.string().trim().min(1).max(500),
}).strict();
const decideSchema = z.object({
  action: z.literal("decide"), deliveryId: z.string().uuid(), expectedRevision: z.number().int().positive(),
  decision: z.enum(["confirmed", "changes_requested"]), note: z.string().trim().min(1).max(1_000),
}).strict();
export const agencyDeliveryCommandSchema = z.discriminatedUnion("action", [requestSchema, acceptSchema, revokeSchema, decideSchema]);
export type AgencyDeliveryCommand = z.infer<typeof agencyDeliveryCommandSchema>;

export interface AgencyDeliveryStore {
  list(actor: OfferingActor, businessId: string): Promise<AgencyDelivery[]>;
  read(actor: OfferingActor, deliveryId: string): Promise<AgencyDelivery>;
  request(actor: OfferingActor, input: {
    businessId: string; installationId: string; assignmentId: string; idempotencyKey: string; commandDigest: string;
  }): Promise<AgencyDelivery>;
  accept(actor: OfferingActor, deliveryId: string): Promise<AgencyDelivery>;
  revoke(actor: OfferingActor, deliveryId: string, expectedRevision: number, reason: string): Promise<AgencyDelivery>;
  decide(actor: OfferingActor, deliveryId: string, expectedRevision: number, decision: "confirmed" | "changes_requested", note: string): Promise<AgencyDelivery>;
}

export interface AgencyAssignmentGateway {
  inspect(actor: OfferingActor, assignmentId: string): Promise<{ assignment: OperationalAssignment; responsibility: { workspaceId: string; payload: { status: string; steps: Array<{ workId: string }> } } }>;
  accept(actor: OfferingActor, assignmentId: string): Promise<OperationalAssignment>;
  revoke(actor: OfferingActor, assignmentId: string): Promise<OperationalAssignment>;
}

export interface AgencyOfferingGateway {
  read(actor: OfferingActor, businessId: string, installationId: string): Promise<OfferingInstallation>;
  canManage(actor: OfferingActor, businessId: string): Promise<boolean>;
}

function assertAgencyRequest(installation: OfferingInstallation): void {
  if (installation.status !== "active") throw new OfferingConflictError("Activate the offering before requesting agency delivery.");
  if (installation.responsibility.kind !== "provider_requested"
    || !["strelva", "agency"].includes(installation.responsibility.providerKind)) {
    throw new OfferingConflictError("This delivery path requires an explicit Strelva or agency agency request.");
  }
}

function assertAssignment(
  delivery: { businessId: string; assignmentId: string; nativeResourceIds?: readonly string[] },
  assigned: Awaited<ReturnType<AgencyAssignmentGateway["inspect"]>>,
  expectedAgency: { kind: "strelva" | "agency"; agencyWorkspaceId?: string },
): void {
  if (assigned.assignment.id !== delivery.assignmentId || assigned.assignment.workspaceId !== delivery.businessId
    || assigned.responsibility.workspaceId !== delivery.businessId
    || assigned.assignment.assigneeKind !== expectedAgency.kind
    || (expectedAgency.kind === "agency" && assigned.assignment.assigneeWorkspaceId !== expectedAgency.agencyWorkspaceId)) {
    throw new OfferingConflictError("The agency assignment no longer matches this delivery request.");
  }
  if (delivery.nativeResourceIds) {
    const resources = new Set(delivery.nativeResourceIds);
    if (!resources.size || assigned.responsibility.payload.steps.some((step) => !resources.has(step.workId))
      || [...resources].some((id) => !assigned.responsibility.payload.steps.some((step) => step.workId === id))) {
      throw new OfferingConflictError("The agency assignment must target the exact installed resource.");
    }
  }
}

export class AgencyDeliveryService {
  constructor(
    private readonly store: AgencyDeliveryStore,
    private readonly offerings: AgencyOfferingGateway,
    private readonly assignments: AgencyAssignmentGateway,
  ) {}

  list(actor: OfferingActor, businessId: string) {
    return this.store.list(actor, z.string().uuid().parse(businessId));
  }

  async execute(actor: OfferingActor, raw: unknown): Promise<AgencyDelivery> {
    const parsed = agencyDeliveryCommandSchema.safeParse(raw);
    if (!parsed.success) throw new OfferingValidationError("The agency delivery command is invalid.");
    const command = parsed.data;
    if (command.action === "request") {
      const installation = await this.offerings.read(actor, command.businessId, command.installationId);
      assertAgencyRequest(installation);
      if (!(await this.offerings.canManage(actor, command.businessId))) throw new OfferingAccessError("Owner or admin access is required to request agency delivery.");
      const assigned = await this.assignments.inspect(actor, command.assignmentId);
      const responsibility = installation.responsibility;
      assertAssignment(
        { ...command, nativeResourceIds: installation.nativeResources.map((resource) => resource.id) },
        assigned,
        responsibility.kind === "provider_requested" && responsibility.providerKind === "agency"
          ? { kind: "agency", agencyWorkspaceId: responsibility.agencyWorkspaceId }
          : { kind: "strelva" },
      );
      if (assigned.assignment.sponsorId !== actor.userId || !["offered", "accepted"].includes(assigned.assignment.status)) {
        throw new OfferingAccessError("The agency assignment must be offered by this customer owner.");
      }
      const commandDigest = createHash("sha256").update(JSON.stringify({
        businessId: command.businessId,
        installationId: command.installationId,
        assignmentId: command.assignmentId,
      })).digest("hex");
      return this.store.request(actor, { ...command, commandDigest });
    }

    const delivery = await this.store.read(actor, command.deliveryId).catch((error) => {
      if (error instanceof OfferingAccessError || error instanceof OfferingConflictError) throw error;
      throw new OfferingNotFoundError("The agency delivery request was not found.");
    });
    if (command.action === "accept") {
      const assigned = await this.assignments.inspect(actor, delivery.assignmentId);
      if (assigned.assignment.assigneeUserId !== actor.userId) throw new OfferingAccessError();
      if (assigned.assignment.assigneeKind === "agency") {
        const expectedAgency = { kind: "agency" as const, agencyWorkspaceId: assigned.assignment.assigneeWorkspaceId ?? undefined };
        assertAssignment(delivery, assigned, expectedAgency);
        const accepted = await this.assignments.accept(actor, delivery.assignmentId);
        if (accepted.status !== "accepted") throw new OfferingConflictError("The exact agency assignment was not accepted.");
        const current = await this.assignments.inspect(actor, delivery.assignmentId);
        assertAssignment(delivery, current, expectedAgency);
        return this.store.accept(actor, delivery.id);
      }
      const installation = await this.offerings.read(actor, delivery.businessId, delivery.installationId);
      assertAgencyRequest(installation);
      const responsibility = installation.responsibility;
      const expectedAgency = responsibility.kind === "provider_requested" && responsibility.providerKind === "agency"
        ? { kind: "agency" as const, agencyWorkspaceId: responsibility.agencyWorkspaceId }
        : { kind: "strelva" as const };
      assertAssignment(delivery, assigned, expectedAgency);
      if (assigned.assignment.assigneeKind !== expectedAgency.kind) throw new OfferingAccessError();
      const accepted = await this.assignments.accept(actor, delivery.assignmentId);
      if (accepted.status !== "accepted") throw new OfferingConflictError("The exact agency assignment was not accepted.");
      const current = await this.assignments.inspect(actor, delivery.assignmentId);
      assertAssignment({ ...delivery, nativeResourceIds: installation.nativeResources.map((resource) => resource.id) }, current, expectedAgency);
      return this.store.accept(actor, delivery.id);
    }

    if (!(await this.offerings.canManage(actor, delivery.businessId))) throw new OfferingAccessError("Owner or admin access is required to manage agency delivery.");
    if (command.action === "revoke") {
      return this.store.revoke(actor, delivery.id, command.expectedRevision, command.reason);
    }

    const assigned = await this.assignments.inspect(actor, delivery.assignmentId);
    const installation = await this.offerings.read(actor, delivery.businessId, delivery.installationId);
    assertAgencyRequest(installation);
    const responsibility = installation.responsibility;
    assertAssignment(
      delivery,
      assigned,
      responsibility.kind === "provider_requested" && responsibility.providerKind === "agency"
        ? { kind: "agency", agencyWorkspaceId: responsibility.agencyWorkspaceId }
        : { kind: "strelva" },
    );
    if (assigned.responsibility.payload.status !== "completed") {
      throw new OfferingConflictError("Your confirmation requires completed assigned work.");
    }
    return this.store.decide(actor, delivery.id, command.expectedRevision, command.decision, command.note);
  }
}

// Compatibility exports for existing internal tooling; stored keys and routes stay unchanged.
/** @deprecated Use AgencyDelivery. */
export type ProviderDelivery = AgencyDelivery;
/** @deprecated Use AgencyDeliveryCommand. */
export type ProviderDeliveryCommand = AgencyDeliveryCommand;
/** @deprecated Use AgencyDeliveryStore. */
export type ProviderDeliveryStore = AgencyDeliveryStore;
/** @deprecated Use AgencyAssignmentGateway. */
export type ProviderAssignmentGateway = AgencyAssignmentGateway;
/** @deprecated Use AgencyOfferingGateway. */
export type ProviderOfferingGateway = AgencyOfferingGateway;
/** @deprecated Use agencyDeliveryStatusSchema. */
export const providerDeliveryStatusSchema = agencyDeliveryStatusSchema;
/** @deprecated Use agencyDeliveryDecisionSchema. */
export const providerDeliveryDecisionSchema = agencyDeliveryDecisionSchema;
/** @deprecated Use agencyDeliverySchema. */
export const providerDeliverySchema = agencyDeliverySchema;
/** @deprecated Use agencyDeliveryCommandSchema. */
export const providerDeliveryCommandSchema = agencyDeliveryCommandSchema;
/** @deprecated Use AgencyDeliveryService. */
export { AgencyDeliveryService as ProviderDeliveryService };
