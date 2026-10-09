import { z } from "zod";

/** Existing domain proposal receipt shape, shared without server/provider imports. */
const recordSchema = z.object({ type: z.string().min(1).max(40), name: z.string().min(1).max(253), value: z.string().min(1).max(1000) }).strict();
const domainResultSchema = z.object({ hostname: z.string(), status: z.string(), checkedAt: z.string(), records: z.array(recordSchema), error: z.string().optional(), routing: z.enum(["verified", "unverified"]).optional(), registrationAttempt: z.enum(["not_submitted", "unknown", "confirmed", "rejected"]).optional() });
export const websiteDomainRequestSchema = z.object({
  id: z.string().uuid(), workspaceId: z.string().uuid(), workId: z.string().uuid(), tenantId: z.string().nullable(),
  systemId: z.string().uuid().optional(),
  publishedRevision: z.number().int().positive(), publishedHash: z.string().regex(/^[0-9a-f]{64}$/),
  hostname: z.string(), records: z.array(recordSchema).min(1).max(20), revisionHash: z.string().regex(/^[0-9a-f]{64}$/),
  createdAt: z.string(), expiresAt: z.string(), current: z.boolean(), decisionId: z.string().uuid().nullable(), result: domainResultSchema.nullable(),
  receiptEmail: z.object({ status: z.enum(["accepted", "suppressed"]), reason: z.string().optional(), providerMessageId: z.string().optional(), acceptedAt: z.string().optional() }).nullable(),
});
export type WebsiteDomainRequest = z.infer<typeof websiteDomainRequestSchema>;

/** Immutable undo receipt emitted by undo_website_linked_cutover. */
export const websiteCutoverUndoReceiptSchema = z.object({
  receiptId: z.string().uuid(), kind: z.literal("rebuild_cutover_undone"),
  tenantId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/), tenantStableId: z.string().uuid(),
  workId: z.string().uuid(), revision: z.number().int().positive(), contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  restoredBy: z.string().uuid(), restoredAt: z.string().datetime({ offset: true }),
  deliveryModel: z.literal("custom_repo"), domainRestored: z.literal(true), fallbackVerified: z.literal(true),
}).strict();
export type WebsiteCutoverUndoReceipt = z.infer<typeof websiteCutoverUndoReceiptSchema>;
