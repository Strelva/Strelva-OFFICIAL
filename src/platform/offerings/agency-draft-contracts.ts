import { z } from "zod";

const uuid = z.string().uuid();
const dateTime = z.string().datetime({ offset: true });

export const agencyApplicationDraftGrantSchema = z.object({
  id: uuid,
  applicationWorkId: uuid,
  businessWorkspaceId: uuid,
  installationId: uuid,
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
export type AgencyApplicationDraftGrant = z.infer<typeof agencyApplicationDraftGrantSchema>;

export const agencyApplicationDraftWorkSchema = z.object({
  applicationWorkId: uuid,
  customerWorkspaceId: uuid,
  customerWorkspaceName: z.string().trim().min(1),
  applicationTitle: z.string().trim().min(1),
  assignmentId: uuid,
  deliveryId: uuid,
  assignmentExpiresAt: dateTime,
  draftGrantStatus: z.enum(["active", "revoked"]).nullable(),
  draftGrantExpiresAt: dateTime.nullable(),
}).strict();
export type AgencyApplicationDraftWork = z.infer<typeof agencyApplicationDraftWorkSchema>;
