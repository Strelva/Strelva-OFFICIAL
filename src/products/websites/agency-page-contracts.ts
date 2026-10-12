import { z } from "zod";
import { recordedActorSchema } from "@/platform/workspaces/types";

/** A new page uses this site's current native connection. It never creates a
 * form service, a schedule, a calendar grant, or an outside effect. */
export const agencyPageInputSchema = z.object({
  workspaceId: z.string().uuid(),
  workId: z.string().uuid(),
  commandId: z.string().uuid(),
  kind: z.enum(["form", "booking"]),
  expectedRevision: z.number().int().nonnegative(),
  candidateRevision: z.number().int().positive(),
  candidateContentHash: z.string().regex(/^[a-f0-9]{64}$/),
  /** The native site's path validator runs again when composing the page. */
  path: z.string().trim().min(2, "Choose a new page address.").max(80).startsWith("/"),
  title: z.string().trim().min(1).max(70),
  description: z.string().trim().max(160),
}).strict();
export type AgencyPageInput = z.infer<typeof agencyPageInputSchema>;
export const agencyPageChoiceSchema = z.object({
  workId: z.string().uuid(), title: z.string(),
  expectedRevision: z.number().int().nonnegative(), candidateRevision: z.number().int().positive(),
  candidateContentHash: z.string().regex(/^[a-f0-9]{64}$/),
  inquiry: z.boolean(), booking: z.boolean(),
}).strict();
export const agencyPageChoicesSchema = z.object({ workspaceId: z.string().uuid(), choices: z.array(agencyPageChoiceSchema) }).strict();
export const agencyPageReceiptSchema = z.object({
  workspaceId: z.string().uuid(), workId: z.string().uuid(), commandId: z.string().uuid(),
  candidateRevision: z.number().int().positive(), contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  previewHref: z.string().startsWith("/api/websites/"),
  actor: recordedActorSchema,
}).strict();
