import { z } from "zod";

/** Native cleanup receipt shared by server execution and operator recovery. */
export const cleanupSchema = z.object({
  id: z.string().uuid(), tenantId: z.string(), revision: z.number().int().nonnegative(), databaseDeleted: z.literal(true),
  redisComplete: z.boolean(), providerComplete: z.boolean(), complete: z.boolean(),
}).passthrough();
export type CleanupReceipt = z.infer<typeof cleanupSchema>;
