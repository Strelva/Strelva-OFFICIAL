/** Shared wire contract for the existing tenant event approval source. */
export interface UnifiedEvent {
  id: string;
  tenantId: string;
  source: 'website' | 'google' | 'yelp' | 'calendly' | 'instagram' | 'vegaro' | 'ai' | 'stripe';
  type: 'review' | 'booking' | 'message' | 'mention' | 'content_update' | 'suggestion' | 'newsletter_draft' | 'change_request' | 'build_payment' | 'change_verified' | 'change_verify_failed' | 'visibility_snapshot';
  title: string;
  body: string;
  status: 'pending' | 'approved' | 'dismissed' | 'auto_approved';
  metadata?: Record<string, unknown> & {
    execution?: {
      // "external_accepted": the non-idempotent external write (GBP post/hours/
      // photo, review reply, newsletter) was ACCEPTED by the provider but the
      // event may not have resolved (lost lock / Redis blip). It is a BLOCKING
      // state — claimEventAction refuses to re-grant so a retry can't duplicate
      // the write; an operator reconciles instead.
      state: "processing" | "external_accepted" | "external_unconfirmed" | "completed" | "failed";
      action: "approved" | "dismissed";
      actor: string;
      attemptId: string;
      startedAt: string;
      finishedAt?: string;
      reason?: string;
      // What the provider accepted, kept on the event as a second copy for
      // reconciliation when the delivery's own marker could not be written.
      acceptance?: {
        providerMessageId?: string;
        acceptedAt?: string;
        deliveryAttemptId?: string;
      };
    };
  };
  createdAt: string;
  resolvedAt?: string;
}

