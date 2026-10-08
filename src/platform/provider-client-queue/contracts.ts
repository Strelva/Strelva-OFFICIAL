import { z } from "zod";
export const providerQueueCursorSchema = z.object({ at: z.iso.datetime({ offset: true }), key: z.string().regex(/^(listing|outside|website|decision):[0-9a-f-]{36}$/) }).strict();
export const providerQueueItemSchema = z.object({
  key: providerQueueCursorSchema.shape.key, workspaceId: z.string().uuid(), workspaceName: z.string(),
  systemId: z.string().uuid().nullable(), kind: z.enum(["readback", "owner_not_told"]),
  title: z.string(), status: z.enum(["failed", "differs", "not_confirmed", "not_checked", "not_sent", "suppressed", "bounced", "expired"]), openedAt: z.iso.datetime({ offset: true }),
}).strict();
export const providerQueuePageSchema = z.object({ agencyWorkspaceId: z.string().uuid(), items: z.array(providerQueueItemSchema).max(100), nextCursor: providerQueueCursorSchema.nullable() }).strict();
export type ProviderQueuePage = z.infer<typeof providerQueuePageSchema>;
export type ProviderQueueCursor = z.infer<typeof providerQueueCursorSchema>;
