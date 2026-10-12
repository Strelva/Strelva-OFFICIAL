"use server";

import { isSuperAdmin } from "@/platform/infra/auth";

export interface ReviewDraftResult {
  ok: boolean;
  drafted: boolean;
  reason?: "unauthorized" | "platform_content_authority_retired";
}

/** Retired compatibility action. No client reads, model calls or draft writes. */
export async function draftReviewReplyForReview(_tenantId: string, _reviewId: string): Promise<ReviewDraftResult> {
  if (!await isSuperAdmin()) return { ok: false, drafted: false, reason: "unauthorized" };
  return { ok: false, drafted: false, reason: "platform_content_authority_retired" };
}
