import { z } from "zod";
import {
  operationRequest,
  WorkspaceAccessError,
  type SavedWork,
  type WorkspaceActor,
} from "@/platform/workspaces";
import { runPrivateAiVisibilityAssessment } from "@/products/ai-visibility/server";
import { AI_VISIBILITY_PRODUCT_ID } from "@/products/ai-visibility/client";
import type { ScoreInput } from "@/products/ai-visibility/contracts";

/** Server-owned shape retained in an incomplete AI Visibility operation. */
export const recoverableAssessmentInputSchema = z.object({
  business: z.string().trim().min(1).max(160),
  url: z.string().trim().max(2048).optional(),
  category: z.string().trim().max(160).optional(),
  location: z.string().trim().max(160).optional(),
}).strict();

export type RecoverableAssessmentInput = z.infer<typeof recoverableAssessmentInputSchema>;

export interface RecoverAssessmentInput {
  actor: WorkspaceActor;
  workspaceId: string;
  operationId: string;
}

/**
 * Recover one supported assessment from its durable operation.
 *
 * The route owns HTTP authentication, body validation and release checks. This
 * operation owns the product discriminator, server-side input reconstruction,
 * and the existing lease/checkpoint/atomic-completion path exposed by the AI
 * Visibility use case. Browser callers cannot substitute assessment inputs.
 */
export async function recoverAssessment({ actor, workspaceId, operationId }: RecoverAssessmentInput): Promise<SavedWork> {
  const operation = await operationRequest(actor, workspaceId, operationId, "read");
  if (operation.product_id !== AI_VISIBILITY_PRODUCT_ID) throw new WorkspaceAccessError();
  const input = recoverableAssessmentInputSchema.parse(operation.input) as ScoreInput;
  return runPrivateAiVisibilityAssessment({ actor, workspaceId, requestId: operationId, input });
}
