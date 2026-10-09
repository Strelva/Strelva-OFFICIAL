import { z } from "zod";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { AskNeedsYouRouting } from "./ports";

/** One presentation change; never a caller-supplied spec, record or account. */
export const askNativeIdentitySchema = z.object({
  workId: z.string().uuid(), designRevision: z.number().int().nonnegative(),
  versionId: z.string().uuid().nullable(), rowRevision: z.number().int().positive().nullable(),
});
export const askNativeChangeSchema = askNativeIdentitySchema.extend({
  change: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("title"), value: z.string().trim().min(1).max(160) }).strict(),
    z.object({ kind: z.literal("field_label"), fieldId: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/), value: z.string().trim().min(1).max(80) }).strict(),
  ]),
}).strict().refine(input => (input.versionId === null) === (input.rowRevision === null), "Version identity and revision must be supplied together.");
export type AskNativeChange = z.infer<typeof askNativeChangeSchema>;
export interface AskNativeSystemPort {
  read(actor: WorkspaceActor, scope: { workspaceId: string; systemId: string }): Promise<Record<string, unknown>>;
  prepare(actor: WorkspaceActor, scope: { workspaceId: string; systemId: string } & AskNativeChange): Promise<{
    workId: string; versionId: string | null; rowRevision: number | null;
    routing: AskNeedsYouRouting; decisionSyncPending: boolean;
  }>;
}
export class AskNativeUnsupportedError extends Error {}
export class AskNativePreparationIncompleteError extends Error {
  constructor(readonly workId: string, readonly versionId: string | null, readonly rowRevision: number | null) {
    super("The saved change needs a current read before preparation can be confirmed. Nothing was approved or put live.");
  }
}
