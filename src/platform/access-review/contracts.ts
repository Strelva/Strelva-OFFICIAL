import { z } from "zod";
export const accessReviewKindSchema = z.enum(["member", "delegation", "operational_assignment", "agency_assignment", "provider", "provider_seat", "agent_token"]);
export const accessReviewScopeSchema = z.object({ workspaceId: z.string().uuid(), organization: z.boolean().default(false) }).strict();
export const accessReviewRevokeSchema = accessReviewScopeSchema.extend({ businessId: z.string().uuid(), kind: accessReviewKindSchema, recordId: z.string().uuid() }).strict();
export const accessReviewSchema = z.object({
  workspaceId: z.string().uuid(), actorUserId: z.string().uuid(), organization: z.boolean(), inaccessibleUnits: z.number().int().nonnegative(),
  units: z.array(z.object({ workspaceId: z.string().uuid(), name: z.string(), role: z.enum(["owner", "admin", "member"]), entries: z.array(z.object({
    id: z.string().uuid(), kind: accessReviewKindSchema, label: z.string(), status: z.string(), lastUsedAt: z.string().nullable(), canRevoke: z.boolean(),
  }).strict()) }).strict()),
}).strict();
export type AccessReview = z.infer<typeof accessReviewSchema>;
export type AccessReviewScope = z.infer<typeof accessReviewScopeSchema>;
export type AccessReviewRevoke = z.infer<typeof accessReviewRevokeSchema>;
