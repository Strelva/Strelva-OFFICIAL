import { z } from "zod";
const check = z.object({ name: z.string(), status: z.enum(["pass","warn","fail"]), score: z.number().min(0).max(100), message: z.string() }).strict();
export const rebuildAuditSnapshotSchema = z.object({ categories: z.array(z.object({ name: z.string(), slug: z.string(), score: z.number().min(0).max(100), checks: z.array(check) }).strict()) }).strict();
export type RebuildAuditSnapshot = z.infer<typeof rebuildAuditSnapshotSchema>;
export const rebuildAuditSchema = z.object({ scope: z.literal("html"), before: rebuildAuditSnapshotSchema, after: rebuildAuditSnapshotSchema, checkedAt: z.string().datetime({ offset:true }), unavailable: z.array(z.string()) }).strict();
