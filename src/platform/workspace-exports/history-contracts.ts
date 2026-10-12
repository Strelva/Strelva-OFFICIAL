import { z } from "zod";

export const ownerExportHistorySchema = z.array(z.object({
  buildId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  status: z.enum(["building", "ready", "failed", "expired", "stalled"]),
  createdAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }).nullable(),
}).refine(row => row.status !== "ready" || row.expiresAt !== null));
export type OwnerExportHistory = z.infer<typeof ownerExportHistorySchema>;
