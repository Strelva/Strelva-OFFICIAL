import { z } from "zod";

const uuid = z.string().uuid();
const section = z.string().trim().min(1).max(80);
const hash = z.string().regex(/^[0-9a-f]{32}$/);
const dateTime = z.string().datetime({ offset: true });

export const agencyManagedWebsiteDraftGrantSchema = z.object({
  id: uuid,
  managedWebsiteBindingId: uuid,
  businessWorkspaceId: uuid,
  tenantId: z.string().trim().min(1).max(120),
  deliveryId: uuid,
  assignmentId: uuid,
  agencyWorkspaceId: uuid,
  operatorUserId: uuid,
  grantedBy: uuid,
  status: z.enum(["active", "revoked"]),
  expiresAt: dateTime,
  createdAt: dateTime,
  updatedAt: dateTime,
  revokedAt: dateTime.nullable(),
  revokedBy: uuid.nullable(),
}).strict();
export type AgencyManagedWebsiteDraftGrant = z.infer<typeof agencyManagedWebsiteDraftGrantSchema>;

export const agencyManagedWebsiteDraftWorkSchema = z.object({
  managedWebsiteBindingId: uuid,
  customerWorkspaceId: uuid,
  customerWorkspaceName: z.string().trim().min(1),
  siteName: z.string().trim().min(1),
  tenantId: z.string().trim().min(1).max(120),
  assignmentId: uuid,
  deliveryId: uuid,
  assignmentExpiresAt: dateTime,
  draftGrantStatus: z.enum(["active", "revoked"]).nullable(),
  draftGrantExpiresAt: dateTime.nullable(),
}).strict();
export type AgencyManagedWebsiteDraftWork = z.infer<typeof agencyManagedWebsiteDraftWorkSchema>;

export const agencyManagedWebsiteDraftRevisionSchema = z.object({
  tenantId: z.string().trim().min(1).max(120),
  section,
  revision: z.number().int().positive(),
  data: z.record(z.string(), z.unknown()),
  dataHash: hash,
  revisionId: uuid,
  preparationId: uuid,
  assignmentId: uuid,
  bindingId: uuid,
}).strict();
export type AgencyManagedWebsiteDraftRevision = z.infer<typeof agencyManagedWebsiteDraftRevisionSchema>;

export const agencyWebsiteDraftStateSchema = z.object({
  tenantId: z.string().trim().min(1).max(120),
  section,
  revision: z.number().int().nonnegative(),
  data: z.record(z.string(), z.unknown()),
  dataHash: hash,
}).strict();
export type AgencyWebsiteDraftState = z.infer<typeof agencyWebsiteDraftStateSchema>;

export const agencyManagedWebsiteDraftPreparationSchema = z.object({
  id: uuid,
  bindingId: uuid,
  businessWorkspaceId: uuid,
  tenantId: z.string().trim().min(1).max(120),
  deliveryId: uuid,
  assignmentId: uuid,
  agencyWorkspaceId: uuid,
  operatorUserId: uuid,
  section,
  data: z.record(z.string(), z.unknown()),
  expectedRevision: z.number().int().nonnegative(),
  expectedHash: hash,
  status: z.enum(["pending", "consumed", "revoked"]),
  createdAt: dateTime,
  consumedAt: dateTime.nullable(),
  revisionId: uuid.nullable(),
}).strict();
export type AgencyManagedWebsiteDraftPreparation = z.infer<typeof agencyManagedWebsiteDraftPreparationSchema>;
