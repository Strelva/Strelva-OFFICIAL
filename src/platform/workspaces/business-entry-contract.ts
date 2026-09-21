import { z } from "zod";

export const businessEntryInputSchema = z.object({
  destination: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("new"), name: z.string().trim().min(1).max(120) }).strict(),
    z.object({ kind: z.literal("existing"), workspaceId: z.string().uuid() }).strict(),
  ]),
  initialRequest: z.string().trim().min(1).max(3000).nullable(),
  idempotencyKey: z.string().uuid(),
}).strict();
export const businessEntryResultSchema = z.object({
  workspaceId: z.string().uuid(), requestId: z.string().uuid().nullable(), alreadyCreated: z.boolean(),
}).strict();
export type BusinessEntryInput = z.infer<typeof businessEntryInputSchema>;
