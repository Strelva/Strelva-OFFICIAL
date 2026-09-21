export interface OfferingConflictReview<TDraft> {
  draft: TDraft;
  attemptedRevision: number | null;
  authoritativeRevision: number | null;
  message: string;
}

export function preserveOfferingDraftOnConflict<TDraft>(
  draft: TDraft,
  input: {
    attemptedRevision?: number;
    authoritativeRevision?: number;
    message: string;
  },
): OfferingConflictReview<TDraft> {
  return {
    draft,
    attemptedRevision: input.attemptedRevision ?? null,
    authoritativeRevision: input.authoritativeRevision ?? null,
    message: input.message,
  };
}

export function offeringRetryFromConflict<TDraft>(
  review: OfferingConflictReview<TDraft>,
): { draft: TDraft; expectedRevision: number } | null {
  if (review.authoritativeRevision === null) return null;
  return { draft: review.draft, expectedRevision: review.authoritativeRevision };
}
