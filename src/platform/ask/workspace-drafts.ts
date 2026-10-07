import { z } from "zod";
import { businessRecordPatchSchema, type BusinessRecordPatch } from "@/platform/business-record/contracts";
import type { ServiceSession } from "@/platform/needs-you/service-actor";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { AskNeedsYouRouting } from "./ports";

/** The model can propose only a validated record patch, never free-text mutation. */
export const askBusinessFactInputSchema = z.object({
  summary: z.string().trim().min(1).max(200),
  expectedRevision: z.number().int().min(0),
  patch: businessRecordPatchSchema,
}).strict();
export type AskBusinessFactInput = z.infer<typeof askBusinessFactInputSchema>;

export const businessFactDraftSchema = z.object({
  id: z.string().uuid(), workspaceId: z.string().uuid(), systemId: z.string().uuid().nullable(),
  expectedRevision: z.number().int().min(0), patch: businessRecordPatchSchema,
  summary: z.string(), status: z.enum(["pending", "approved", "declined"]),
  askedOnBehalf: z.enum(["email", "phone"]).nullable().optional(),
  createdAt: z.string(), receipt: z.object({ sequence: z.number().int().positive(), revision: z.number().int().min(0) }).nullable(),
});
export type BusinessFactDraft = z.infer<typeof businessFactDraftSchema>;

export interface BusinessFactDraftStore {
  save(actor: WorkspaceActor, input: AskBusinessFactInput & { workspaceId: string; systemId: string | null; askedOnBehalf?: "email" | "phone" | null; idempotencyKey: string }): Promise<BusinessFactDraft>;
  list(actor: WorkspaceActor, workspaceId: string): Promise<BusinessFactDraft[]>;
  resolveOwnerLink?(actor: WorkspaceActor, workspaceId: string, draftId: string, decision: "approve" | "not_yet", session: ServiceSession): Promise<BusinessFactDraft>;
  resolve(actor: WorkspaceActor, workspaceId: string, draftId: string, decision: "approve" | "not_yet"): Promise<BusinessFactDraft>;
}

export interface AskWorkspaceDraftPort {
  businessFact(actor: WorkspaceActor, input: AskBusinessFactInput & { workspaceId: string; systemId: string | null; askedOnBehalf?: "email" | "phone" | null; idempotencyKey: string }): Promise<{ draftId: string; routing: AskNeedsYouRouting; decisionSyncPending?: boolean }>;
  inquiryReply(actor: WorkspaceActor, input: { workspaceId: string; tenantId: string; inquiryId: string; replyText: string }): Promise<{ eventIds: string[] }>;
  readInquiries?(actor: WorkspaceActor, workspaceId: string): Promise<unknown>;
  readBookings?(actor: WorkspaceActor, workspaceId: string): Promise<unknown>;
  /** Read first to pin the draft to the exact current record revision. */
  readBusiness(actor: WorkspaceActor, workspaceId: string): Promise<{ revision: number; facts: unknown; services: unknown; people: unknown }>;
}

/** A patch authored in Ask is inferred, including when the owner asked for it. */
export function businessFactDraftPatch(patch: unknown): BusinessRecordPatch {
  const parsed = businessRecordPatchSchema.parse(patch);
  if (JSON.stringify(parsed).length > 600) throw new Error("ask_draft_too_large_split_change");
  if (Object.values(parsed.facts ?? {}).some(entry => entry?.verified === true)
    || [...(parsed.services ?? []), ...(parsed.people ?? [])].some(entry => entry.op === "upsert" && entry.verified === true)) {
    throw new Error("ask_draft_cannot_verify_fact");
  }
  return parsed;
}
