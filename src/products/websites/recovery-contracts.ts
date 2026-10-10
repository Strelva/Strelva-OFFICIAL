import { z } from "zod";

/** Compatibility entry; platform owns the stored owner-domain proposal shape. */
export { websiteDomainRequestSchema, type WebsiteDomainRequest } from "@/platform/needs-you/sources/website-domain-contracts";

/** Immutable undo receipt emitted by undo_website_linked_cutover. */
export const websiteCutoverUndoReceiptSchema = z.object({
  receiptId: z.string().uuid(), kind: z.literal("rebuild_cutover_undone"),
  tenantId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/), tenantStableId: z.string().uuid(),
  workId: z.string().uuid(), revision: z.number().int().positive(), contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  restoredBy: z.string().uuid(), restoredAt: z.string().datetime({ offset: true }),
  deliveryModel: z.literal("custom_repo"), domainRestored: z.literal(true), fallbackVerified: z.literal(true),
}).strict();
export type WebsiteCutoverUndoReceipt = z.infer<typeof websiteCutoverUndoReceiptSchema>;
