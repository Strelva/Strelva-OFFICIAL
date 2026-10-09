import { z } from "zod";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const legacyArchiveSummarySchema = z.object({
  archiveId: hash, workspaceId: z.string().uuid(), sourceWorkId: z.string().uuid(),
  sourceVersion: z.literal(1), sourceRevision: z.number().int().nonnegative(), sourceDigest: hash, evidenceDigest: hash,
  retainedCandidates: z.number().int().nonnegative().max(503), unresolvedCandidates: z.number().int().nonnegative().max(503),
}).strict().refine(row => row.retainedCandidates + row.unresolvedCandidates <= 503, "Archive reference count exceeds its source bound");
export type LegacyArchiveSummary = z.infer<typeof legacyArchiveSummarySchema>;
