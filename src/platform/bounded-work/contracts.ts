import { z } from "zod";
export const baseSchema = z.object({
  version: z.literal(1), revision: z.number().int().nonnegative(), title: z.string().trim().min(1).max(160),
  createdBy: z.string().min(1), createdAt: z.string().datetime(),
  history: z.array(z.object({ revision: z.number().int().positive(), kind: z.string().min(1), actorId: z.string().min(1), at: z.string().datetime() })).max(500),
});
