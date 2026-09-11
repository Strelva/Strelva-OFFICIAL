import { z } from "zod";
import { WorkspaceConflictError } from "@/platform/workspaces/types";

export const documentContentSchema = z.object({ title: z.string().trim().min(1).max(160), text: z.string().max(50000) });
const receiptSchema = z.object({
  revision: z.number().int().positive(), actorId: z.string().min(1), at: z.string().datetime(),
  kind: z.enum(["edit", "undo"]), before: documentContentSchema, after: documentContentSchema,
  undoesRevision: z.number().int().positive().optional(),
});
export const documentSchema = documentContentSchema.extend({
  version: z.literal(1), revision: z.number().int().nonnegative(),
  createdBy: z.string().min(1), createdAt: z.string().datetime(),
  history: z.array(receiptSchema).max(200),
});
export type WorkspaceDocument = z.infer<typeof documentSchema>;
export const documentCommandSchema = z.discriminatedUnion("kind", [
  documentContentSchema.extend({ kind: z.literal("edit"), expectedRevision: z.number().int().nonnegative() }),
  z.object({ kind: z.literal("undo"), expectedRevision: z.number().int().nonnegative(), targetRevision: z.number().int().positive() }),
]);

export function createDocument(input: unknown, actorId: string): WorkspaceDocument {
  return documentSchema.parse({ ...documentContentSchema.parse(input), version: 1, revision: 0, createdBy: actorId, createdAt: new Date().toISOString(), history: [] });
}

/** Private document changes never publish a website or grant authority. */
export function changeDocument(value: WorkspaceDocument, raw: unknown, actorId: string): WorkspaceDocument {
  const doc = documentSchema.parse(value);
  const command = documentCommandSchema.parse(raw);
  if (command.expectedRevision !== doc.revision) throw new WorkspaceConflictError("This document has a newer revision. Reload it before saving.");
  let content: z.infer<typeof documentContentSchema>;
  if (command.kind === "undo") {
    const target = doc.history.at(-1);
    if (!target || target.kind !== "edit" || target.revision !== command.targetRevision) throw new WorkspaceConflictError("Only the latest edit can be undone. Later work must be preserved.");
    content = target.before;
  } else content = documentContentSchema.parse(command);
  if (doc.title === content.title && doc.text === content.text) throw new WorkspaceConflictError("There are no changes to save.");
  const revision = doc.revision + 1;
  return documentSchema.parse({ ...doc, ...content, revision, history: [...doc.history, {
    revision, actorId, at: new Date().toISOString(), kind: command.kind,
    before: { title: doc.title, text: doc.text }, after: content,
    ...(command.kind === "undo" ? { undoesRevision: command.targetRevision } : {}),
  }] });
}
