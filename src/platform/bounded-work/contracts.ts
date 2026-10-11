import { z } from "zod";
import { recordedActorSchema } from "@/platform/presentation/actor";
export const baseSchema = z.object({
  version: z.literal(1), revision: z.number().int().nonnegative(), title: z.string().trim().min(1).max(160),
  maintenanceActor: recordedActorSchema.nullable().optional().catch(null),
  createdBy: z.string().min(1), createdAt: z.string().datetime(),
  history: z.array(z.object({ actor: recordedActorSchema.nullable().optional().catch(null), revision: z.number().int().positive(), kind: z.string().min(1), actorId: z.string().min(1), at: z.string().datetime({ offset: true }) })).max(500),
});
