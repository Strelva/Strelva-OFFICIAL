import { z } from "zod";

const iso = z.string().min(1);
const uuid = z.string().uuid();

/** read_agency_client_owner_reach, one object per readable client. No address, token or name. */
export const ownerReachRowSchema = z.object({
  workspaceId: uuid,
  ownerMember: z.boolean(),
  contact: z.enum(["none", "trusted", "trusted_staff"]),
  contactProposed: z.boolean(),
  invite: z.object({
    kind: z.enum(["agency_claim", "owner_invitation"]),
    expiresAt: iso,
    deliveryStatus: z.enum(["not_sent", "sending", "accepted", "unknown"]),
    deliveryReason: z.string().nullable(),
    recipientStaff: z.boolean(),
  }).strict().nullable(),
  canIssueClaim: z.boolean(),
  decisions: z.array(z.object({ id: uuid, expiresAt: iso, deliveryState: z.string() }).strict()),
  lapsedRecently: z.number().int().min(0),
}).strict();
export type OwnerReachRow = z.infer<typeof ownerReachRowSchema>;

const staffReason = z.enum(["platform_operator", "agency_member", "staff_domain"]).nullable();

/** operator_owner_reach_report, one object per business. Operators only: addresses are present. */
export const operatorOwnerReachRowSchema = z.object({
  workspaceId: uuid,
  name: z.string(),
  sites: z.array(z.string()),
  ownerMember: z.boolean(),
  trusted: z.object({ email: z.string(), trustedVia: z.string(), staffReason }).strict().nullable(),
  tenantOwnerEmails: z.array(z.object({ tenantId: z.string(), email: z.string().nullable(), staffReason }).strict()),
  proposed: z.object({ email: z.string(), actorKind: z.string(), at: iso }).strict().nullable(),
  invite: z.object({
    kind: z.enum(["agency_claim", "owner_invitation"]),
    recipientEmail: z.string(),
    expiresAt: iso,
    deliveryStatus: z.string(),
    recipientStaffReason: staffReason,
  }).strict().nullable(),
  openDecisions: z.number().int().min(0),
  soonestLapse: iso.nullable(),
  lapsed14d: z.number().int().min(0),
}).strict();
export type OperatorOwnerReachRow = z.infer<typeof operatorOwnerReachRowSchema>;
