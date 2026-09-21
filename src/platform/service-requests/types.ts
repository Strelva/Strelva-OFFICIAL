import { z } from "zod";
import { deliveryCommitmentSchema } from "./delivery-commitment";

export interface ServiceRequestActor { userId: string; verifiedEmail: string; }
export const serviceRequestProviderSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("strelva") }).strict(),
  z.object({ kind: z.literal("agency"), agencyWorkspaceId: z.string().uuid() }).strict(),
]);
export type ServiceRequestProvider = z.infer<typeof serviceRequestProviderSchema>;
export const serviceRequestStatusSchema = z.enum(["draft", "requested", "withdrawn"]);
export const serviceRequestProviderAcceptanceSchema = z.object({
  status: z.enum(["pending", "accepted", "declined"]),
  actorId: z.string().uuid().nullable(), acceptedAt: z.string().datetime({ offset: true }).nullable(), note: z.string().nullable(),
}).strict();
export const serviceRequestSchema = z.object({
  id: z.string().uuid(), businessId: z.string().uuid(), status: serviceRequestStatusSchema,
  request: z.string().min(1).max(3_000), outcome: z.string().min(1).max(3_000),
  context: z.record(z.string(), z.unknown()), scope: z.array(z.string().min(1).max(120)).min(1).max(16),
  provider: serviceRequestProviderSchema, providerAcceptance: serviceRequestProviderAcceptanceSchema,
  installationId: z.string().uuid().nullable(), deliveryId: z.string().uuid().nullable(),
  deliveryCommitment: deliveryCommitmentSchema.nullable().optional(),
  revision: z.number().int().positive(), createdBy: z.string().uuid(),
  createdAt: z.string().datetime({ offset: true }), updatedAt: z.string().datetime({ offset: true }),
}).strict();
export type ServiceRequest = z.infer<typeof serviceRequestSchema>;
export class ServiceRequestValidationError extends Error {
  constructor(message = "The service request is invalid.") { super(message); this.name = "ServiceRequestValidationError"; }
}
export class ServiceRequestAccessError extends Error {
  constructor(message = "This service request is unavailable to your account.") { super(message); this.name = "ServiceRequestAccessError"; }
}
export class ServiceRequestConflictError extends Error {
  constructor(message = "The service request changed. Reload before continuing.") { super(message); this.name = "ServiceRequestConflictError"; }
}
export class ServiceRequestNotFoundError extends Error {
  constructor(message = "The service request was not found.") { super(message); this.name = "ServiceRequestNotFoundError"; }
}
export class ServiceRequestStoreError extends Error {
  constructor(message = "Service request storage is unavailable.") { super(message); this.name = "ServiceRequestStoreError"; }
}
