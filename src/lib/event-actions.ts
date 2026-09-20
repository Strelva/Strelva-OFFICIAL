import { executeAgentPrompt } from "./agent-executor";
import { claimEventAction, finishEventAction, getEvent, getEventRaw, markExecutionExternalAccepted, resolveEvent, updateEvent } from "./events";
import { updateSuggestion } from "./suggestions";
import { isCustomChangeRequestMetadata } from "./custom-repos";
import {
  appendVersion,
  clearDraft,
  getContent,
  getDraftContent,
  logActivity,
  recordSectionUpdate,
  setContent,
} from "./storage";
import { clientRevalidationTargetForSections } from "./content-revalidation";
import { diffFields } from "./utils";
import { recordApproval, recordRejection } from "./ai-auto-approve";
import { GBP_OPERATIONS } from "./agent/gbp-operations";
import {
  shadowChangeRequestWorkflow,
  shadowFinishExecutionAttempt,
  shadowStartExecutionAttempt,
} from "./governed-work/shadow";
import type { ContentMap, ContentSection } from "./types";
import type { CustomChangeRequestStatus } from "./types";
import {
  authorizeInquiryMessageReviewActor,
  executeInquiryMessageReview,
  isInquiryMessageReviewEvent,
  reconcileInquiryMessageReview,
} from "@/products/inquiries";

export type EventWorkflowAction =
  | "approved"
  | "dismissed"
  | "triaged"
  | "quoted"
  | "accepted"
  | "in_progress"
  | "shipped"
  | "declined";

/**
 * Record a published Google Business action in the owner-facing activity feed.
 * A GBP post/hours/photo only reaches here after a SUCCESSFUL live write on the
 * owner's approval, so it is genuinely-done Strelva work (actor:"admin" — from
 * the client's side it's all "Strelva managed my listing"). Fail-soft: an
 * activity-log blip must never break the approval that already succeeded.
 */
async function logGbpActivity(
  tenantId: string,
  type: "gbp-post" | "gbp-hours" | "gbp-photo",
  text: string,
): Promise<void> {
  try {
    await logActivity(
      { type, text, time: new Date().toISOString(), actor: "admin", suppressEvent: true },
      tenantId,
    );
  } catch {
    // A feed-logging failure is never fatal to a completed publish.
  }
}

const CUSTOM_WORKFLOW_ACTIONS = new Set<EventWorkflowAction>([
  "triaged",
  "quoted",
  "accepted",
  "in_progress",
  "shipped",
  "declined",
]);

const INQUIRY_PUBLICATION_KINDS = new Set([
  "inquiry_capability_publish",
  "inquiry_capability_undo",
]);

function workflowStatusFromAction(action: EventWorkflowAction): CustomChangeRequestStatus | null {
  if (action === "approved" || action === "dismissed") return null;
  return action;
}

/**
 * Escalate a pending operator-approval draft to the client. Flips the draft's
 * `reviewAudience` to "owner" so it appears in the client's "Needs you" for THEIR
 * decision — used when the operator is unsure and wants the owner to make the call.
 * Stays pending (nothing publishes); tenant-scoped for safety.
 */
export async function escalateEventToOwner(
  tenantId: string,
  eventId: string,
): Promise<{ changed: boolean; reason?: string }> {
  const event = await getEvent(eventId);
  if (!event) return { changed: false, reason: "not_found" };
  if (event.tenantId !== tenantId) return { changed: false, reason: "wrong_tenant" };
  if (event.status !== "pending") return { changed: false, reason: "not_pending" };
  const updated = await updateEvent(eventId, (e) => ({
    ...e,
    metadata: { ...e.metadata, reviewAudience: "owner", escalatedByOperator: true },
  }));
  return { changed: Boolean(updated) };
}

export async function resolveEventAction(
  tenantId: string,
  eventId: string,
  action: EventWorkflowAction,
  actorId = "user",
): Promise<{ changed: boolean; reason?: string }> {
  // Redis-authoritative read: this path EXECUTES the event's payload (the
  // external write), so it must see live metadata — an owner-edited review reply,
  // a refreshed suggestion prompt — not the add-time snapshot the READ_PG mirror
  // would serve. (getEvent, used by read surfaces, can return the PG twin.)
  const event = await getEventRaw(eventId);
  if (!event) return { changed: false, reason: "not_found" };
  if (event.tenantId !== tenantId) return { changed: false, reason: "wrong_tenant" };
  if (event.status !== "pending") return { changed: false, reason: "already_resolved" };

  // A message review has a provider checkpoint in addition to its event. If a
  // process stopped after the provider accepted the message, recover the
  // receipt and resolve the existing event without calling the provider again.
  // This also covers a process that died while the event was still marked
  // processing: the durable delivery marker is the only safe source of truth.
  if (
    isInquiryMessageReviewEvent(event) &&
    (event.metadata?.execution?.state === "external_accepted" || event.metadata?.execution?.state === "processing")
  ) {
    // Reconciliation may close an accepted provider write without sending
    // again. It still resolves the governed event, so the current clicker must
    // be the live responsibility sponsor before we allow that transition.
    // Never infer authorization from the event's requestedBy metadata or from
    // the actor that started the abandoned attempt.
    const authorized = await authorizeInquiryMessageReviewActor({ tenantId, event, actorId });
    if (!authorized.allowed) {
      return { changed: false, reason: authorized.reason || "permission_denied" };
    }
    const recovery = await reconcileInquiryMessageReview({ tenantId, event, actorId });
    if (!recovery.safeToResolve) {
      return { changed: false, reason: recovery.reason || "responsibility_receipt_reconciliation_required" };
    }
    if (event.metadata?.execution?.state === "processing") await markExecutionExternalAccepted(eventId);
    const resolved = await resolveEvent(eventId, "approved", { actor: actorId });
    return resolved.changed
      ? { changed: true, ...(recovery.verified ? {} : { reason: recovery.reason || "accepted_unverified" }) }
      : { changed: false, reason: "already_resolved" };
  }

  // Recovery exit for a wedged "external_accepted" event: the non-idempotent
  // external write already succeeded (that is what the marker means) but the
  // resolve step lost its lock / hit a blip and left the event pending. Any
  // later attempt (the cron retry, an operator click, bulk approve) COMPLETES
  // the resolve only — it must NEVER re-run the external write. Without this the
  // event was stuck pending until the 90-day TTL and every approve/dismiss on it
  // failed opaquely. Resolve as "approved" (the marker is only ever set on an
  // accepted approval); resolveEvent no-ops idempotently if already resolved.
  if (event.metadata?.execution?.state === "external_accepted") {
    const resolved = await resolveEvent(eventId, "approved", { actor: "user" });
    return resolved.changed ? { changed: true } : { changed: false, reason: "already_resolved" };
  }

  if (event.type === "change_request" && CUSTOM_WORKFLOW_ACTIONS.has(action)) {
    if (!isCustomChangeRequestMetadata(event.metadata)) {
      return { changed: false, reason: "not_custom_change_request" };
    }

    const workflowStatus = workflowStatusFromAction(action);
    if (!workflowStatus) return { changed: false, reason: "invalid_action" };

    // ONE timestamp for resolvedAt + shippedAt + workflowUpdatedAt so the Postgres
    // reconstruction can recover resolvedAt from workflowUpdatedAt exactly (gap #3).
    const now = new Date().toISOString();
    let noOp = false;
    const result = await updateEvent(eventId, (existing) => {
      // Re-check the CURRENT status under the lock — the pre-lock snapshot may be
      // stale (a concurrent dismiss/approve committed, or READ_PG served a
      // resolved event as pending). Never overwrite a resolved request back to
      // pending or flip one terminal state to another.
      if (existing.status !== "pending") {
        noOp = true;
        return existing;
      }
      const nextStatus = workflowStatus === "shipped"
        ? "approved"
        : workflowStatus === "declined"
          ? "dismissed"
          : existing.status; // a non-terminal step keeps it pending
      const priorHistory = Array.isArray(existing.metadata?.workflowHistory)
        ? existing.metadata.workflowHistory.filter((entry): entry is { status: string; actor: string; at: string } => Boolean(entry)
          && typeof entry === "object"
          && typeof (entry as Record<string, unknown>).status === "string"
          && typeof (entry as Record<string, unknown>).actor === "string"
          && typeof (entry as Record<string, unknown>).at === "string")
        : [];
      return {
        ...existing,
        status: nextStatus,
        resolvedAt: nextStatus === "approved" || nextStatus === "dismissed"
          ? now
          : existing.resolvedAt,
        metadata: {
          ...existing.metadata,
          workflowStatus,
          quoteRequired: workflowStatus === "quoted" ? true : existing.metadata?.quoteRequired,
          shippedAt: workflowStatus === "shipped" ? now : existing.metadata?.shippedAt,
          workflowUpdatedAt: now,
          workflowHistory: [...priorHistory, { status: workflowStatus, actor: actorId, at: now }],
        },
      };
    });
    if (noOp) return { changed: false, reason: "already_resolved" };
    // Re-sync the governed-work shadow (gap #3): flag-gated + best-effort, never
    // affects the Redis-authoritative result above.
    if (result.changed && result.event) {
      await shadowChangeRequestWorkflow(result.event);
    }
    return { changed: result.changed };
  }

  if (action !== "approved" && action !== "dismissed") {
    return { changed: false, reason: "invalid_action" };
  }

  const claim = await claimEventAction(eventId, action, actorId);
  if (!claim.acquired) return { changed: false, reason: claim.reason };

  // Governed-work execution shadow (SEPARATE flag, default OFF, best-effort). Only
  // an approval performs the external write, so only an approval opens an attempt;
  // the Redis attemptId is the idempotency key. This is the attempt-owning
  // chokepoint (it holds attemptId + the single success/fail result); it does not
  // touch executeResolvedEventAction's branches. See shadow.ts. #7 migration must be
  // applied before the flag is enabled.
  const shadowAttemptId =
    action === "approved" ? await shadowStartExecutionAttempt(eventId, claim.attemptId) : null;

  try {
    const result = await executeResolvedEventAction(tenantId, eventId, action, event, actorId);
    await finishEventAction(eventId, claim.attemptId, {
      state: result.changed ? "completed" : "failed",
      reason: result.reason,
    });
    await shadowFinishExecutionAttempt(shadowAttemptId, {
      success: result.changed,
      detail: result.reason,
    });
    return result;
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 200) : "action_failed";
    await finishEventAction(eventId, claim.attemptId, { state: "failed", reason });
    await shadowFinishExecutionAttempt(shadowAttemptId, { success: false, detail: reason });
    throw error;
  }
}

async function executeResolvedEventAction(
  tenantId: string,
  eventId: string,
  action: "approved" | "dismissed",
  event: NonNullable<Awaited<ReturnType<typeof getEvent>>>,
  actorId: string,
): Promise<{ changed: boolean; reason?: string }> {

  if (isInquiryMessageReviewEvent(event)) {
    const authorized = await authorizeInquiryMessageReviewActor({ tenantId, event, actorId });
    if (!authorized.allowed) return { changed: false, reason: authorized.reason || "permission_denied" };
    if (action === "dismissed") {
      const resolved = await resolveEvent(eventId, "dismissed", { actor: actorId });
      return resolved.changed ? { changed: true } : { changed: false, reason: "already_resolved" };
    }

    const execution = await executeInquiryMessageReview({ tenantId, eventId, event, actorId });
    // Once the provider has accepted a message, close the duplicate barrier
    // before any receipt or event-resolution work. A receipt persistence blip
    // therefore leaves a recoverable, blocking event instead of enabling a
    // second provider call.
    if (execution.accepted) await markExecutionExternalAccepted(eventId);
    if (!execution.accepted) return { changed: false, reason: execution.reason || "delivery_unavailable" };
    if (!execution.safeToResolve || !execution.receiptPersisted) {
      return { changed: false, reason: execution.reason || "responsibility_receipt_reconciliation_required" };
    }
    const resolved = await resolveEvent(eventId, "approved", { actor: actorId });
    if (!resolved.changed) return { changed: false, reason: "already_resolved" };
    return execution.verified
      ? { changed: true }
      : { changed: true, reason: execution.reason || "accepted_unverified" };
  }

  if (
    event.type === "change_request" &&
    typeof event.metadata?.kind === "string" &&
    INQUIRY_PUBLICATION_KINDS.has(event.metadata.kind)
  ) {
    if (action === "approved") {
      const claimId = typeof event.metadata?.publicationClaimId === "string"
        ? event.metadata.publicationClaimId.trim()
        : "";
      if (!claimId) return { changed: false, reason: "inquiry_publication_claim_missing" };
      const { executeInquiryPublication } = await import("@/products/inquiries/server");
      const publication = await executeInquiryPublication({ tenantId, eventId, claimId });
      if (!publication.accepted) {
        return { changed: false, reason: publication.reason || "inquiry_publication_failed" };
      }
      // Provider acceptance closes the write before event resolution. A failed
      // read-back remains accepted and non-retryable; its verification evidence
      // is recorded by the inquiry executor.
      await markExecutionExternalAccepted(eventId);
      const resolved = await resolveEvent(eventId, "approved", { actor: "user" });
      if (!resolved.changed) return { changed: false, reason: "already_resolved" };
      return publication.verified
        ? { changed: true }
        : { changed: true, reason: publication.reason || "accepted_unverified" };
    }
    const resolved = await resolveEvent(eventId, "dismissed", { actor: "user" });
    return resolved.changed ? { changed: true } : { changed: false, reason: "already_resolved" };
  }

  // For approvals that actually do something external (post to Google, send an
  // email, publish content), validate + perform the effect BEFORE flipping the
  // event to resolved. A failed or stale action must leave the item pending —
  // never resolve it and have the UI falsely say "Made live".

  if (event.type === "content_update") {
    const kind = event.metadata?.kind;

    // GBP writes (post / hours / photo) dispatch through the operation registry
    // (`GBP_OPERATIONS`), which owns the per-kind validate + external-write. The
    // governance spine stays HERE and is identical across all three:
    //
    // We gate resolution on `success` (Google accepted the write), NOT on
    // `verified` (the read-back confirmation). A GBP write is NON-IDEMPOTENT —
    // once `success` is true the change already exists on Google, so keeping the
    // event pending would let a re-approval create a DUPLICATE. When the
    // read-back can't confirm (success=true, verified=false), the write function
    // already emits a separate `change_verify_failed` event to surface the gap;
    // that's the right signal, not a stuck approval. The external write happens
    // ONLY on `approved` (a dismiss just resolves), and the `gbp-*` activity is
    // logged ONLY after the event actually resolves.
    const gbpOp = GBP_OPERATIONS.find((o) => o.kind === kind);
    if (gbpOp?.execute) {
      let activity: { type: "gbp-post" | "gbp-hours" | "gbp-photo"; detail: string } | undefined;
      if (action === "approved") {
        const r = await gbpOp.execute({ tenantId, event });
        if (!r.ok) return { changed: false, reason: r.reason };
        activity = r.activity;
        // The write is live on Google — mark acceptance BEFORE resolving so a
        // lost resolve-lock or crash can't let a retry duplicate the post.
        await markExecutionExternalAccepted(eventId);
      }
      const resolved = await resolveEvent(eventId, action, { actor: "user" });
      if (resolved.changed && action === "approved" && activity) {
        await logGbpActivity(tenantId, activity.type, activity.detail);
      }
      return resolved.changed ? { changed: true } : { changed: false, reason: "already_resolved" };
    }

    // Structural change (H6): never auto-applied — it's queued manual work for
    // the builder. Resolve it, but signal the handoff so the UI doesn't claim
    // "Made live" for a change that hasn't shipped.
    if (kind === "manual_structural_change") {
      const resolved = await resolveEvent(eventId, action, { actor: "user" });
      return resolved.changed
        ? { changed: true, reason: "structural_handoff" }
        : { changed: false, reason: "already_resolved" };
    }

    // Section content (H4): confirm a draft exists and isn't stale BEFORE
    // resolving, then resolve (claim) and only apply if we won the claim.
    const section = typeof event.metadata?.section === "string"
      ? event.metadata.section as ContentSection
      : null;

    if (section && action === "approved") {
      const metadataDraft =
        kind === "agent_preview" &&
        event.metadata?.proposedData &&
        typeof event.metadata.proposedData === "object" &&
        !Array.isArray(event.metadata.proposedData)
          ? event.metadata.proposedData
          : null;
      const draft = (await getDraftContent(section, tenantId)) || metadataDraft;
      if (!draft) return { changed: false, reason: "draft_not_found" };

      // Stale-overwrite guard: if the section was edited after this change was
      // proposed, the queued AI change is stale — refuse rather than silently
      // revert the owner's newer edit.
      const { getSectionTimestamps } = await import("./storage");
      const timestamps = await getSectionTimestamps(tenantId).catch(
        () => ({}) as Record<string, string>,
      );
      const sectionUpdatedAt = timestamps[section] ? new Date(timestamps[section]).getTime() : 0;
      const proposedAt = event.createdAt ? new Date(event.createdAt).getTime() : 0;
      if (sectionUpdatedAt && proposedAt && sectionUpdatedAt > proposedAt) {
        return { changed: false, reason: "stale_superseded" };
      }

      const current = (await getContent(section, tenantId)) as unknown as Record<string, unknown>;
      // The live write is the authoritative effect. Resolve only after it
      // succeeds so a storage failure cannot produce a false "Made live" state.
      await setContent(section, draft as ContentMap[typeof section], tenantId);
      const resolved = await resolveEvent(eventId, action, { actor: "user" });
      if (!resolved.changed) return { changed: false, reason: "already_resolved" };
      await appendVersion(
        section,
        draft,
        "user",
        tenantId,
        diffFields(current, draft as unknown as Record<string, unknown>),
        eventId,
      );
      await recordSectionUpdate(section, tenantId);
      const { revalidatePath } = await import("next/cache");
      revalidatePath("/");
      const { revalidateClientSite } = await import("./revalidate-client");
      revalidateClientSite(tenantId, clientRevalidationTargetForSections([section])).catch(() => {});
      await clearDraft(section, tenantId);
      if (event.source === "ai") recordApproval(tenantId).catch(() => {});
      return { changed: true };
    }

    // Dismissed, or a content_update with no section: resolve + clean up.
    const resolved = await resolveEvent(eventId, action, { actor: "user" });
    if (!resolved.changed) return { changed: false, reason: "already_resolved" };
    if (section) await clearDraft(section, tenantId);
    if (event.source === "ai") {
      (action === "approved" ? recordApproval : recordRejection)(tenantId).catch(() => {});
    }
    return { changed: true };
  }

  // Newsletter draft (B2): on approve, actually send to subscribers.
  if (event.type === "newsletter_draft") {
    if (action === "approved") {
      const subject = typeof event.metadata?.subject === "string" ? event.metadata.subject : "";
      const body = typeof event.metadata?.body === "string" ? event.metadata.body : "";
      if (!subject || !body) return { changed: false, reason: "newsletter_invalid" };
      const { sendNewsletter } = await import("./newsletter");
      // Pass the event id as the idempotency prefix so a retry after a partial
      // send doesn't re-deliver batches Resend already accepted.
      const result = await sendNewsletter(tenantId, { subject, body, idempotencyKeyPrefix: eventId });
      if (!result.success) return { changed: false, reason: result.reason || "newsletter_failed" };
      // Mails accepted by Resend — mark acceptance before resolving (a retry is
      // idempotency-keyed, but the marker also blocks a re-claim entirely).
      await markExecutionExternalAccepted(eventId);
    }
    const resolved = await resolveEvent(eventId, action, { actor: "user" });
    return resolved.changed ? { changed: true } : { changed: false, reason: "already_resolved" };
  }

  // Review reply draft: on approve, publish the reply to the Google listing.
  // Governed like the other external writes — the reply only reaches Google
  // through this approval (owner-facing, via the queue route's auth), and a
  // failed publish leaves the draft pending so the queue can't falsely show it
  // as handled.
  if (event.type === "review" && event.metadata?.kind === "review_reply_draft") {
    const metaReviewId = typeof event.metadata?.reviewId === "string" ? event.metadata.reviewId : "";
    if (action === "approved") {
      const reviewId = metaReviewId;
      const replyText =
        typeof event.metadata?.draftedReply === "string"
          ? event.metadata.draftedReply
          : typeof event.body === "string"
            ? event.body
            : "";
      if (!reviewId || !replyText) return { changed: false, reason: "review_reply_invalid" };
      const { publishReviewReply } = await import("./gbp-replies");
      const result = await publishReviewReply(tenantId, reviewId, replyText);
      if (!result.published) return { changed: false, reason: "review_reply_failed" };
      // Reply accepted by Google — mark acceptance before resolving so a lost
      // lock / crash can't let a retry re-post it.
      await markExecutionExternalAccepted(eventId);
      // Mirror the published reply onto the review row (keyed by the Google
      // external id) so the auto-post backlog no longer treats the review as
      // unreplied and re-drafts + re-posts it in an endless loop.
      const { replyToReviewByExternalId } = await import("./reviews");
      await replyToReviewByExternalId(tenantId, reviewId, replyText).catch(() => {});
    }
    const resolved = await resolveEvent(eventId, action, { actor: "user" });
    if (resolved.changed && action === "dismissed" && metaReviewId) {
      // A dismissal is a per-review veto: mark it durably so the backlog never
      // re-drafts (and eventually auto-posts) a reply the owner rejected.
      const { markReviewReplyDeclined } = await import("./review-replies");
      await markReviewReplyDeclined(tenantId, metaReviewId).catch(() => {});
    }
    return resolved.changed ? { changed: true } : { changed: false, reason: "already_resolved" };
  }

  // Remaining simple cases (suggestion, etc.) — resolve then handle.
  const resolved = await resolveEvent(eventId, action, { actor: "user" });
  if (!resolved.changed) return { changed: false, reason: "already_resolved" };

  if (event.type !== "suggestion") return { changed: true };

  const suggestionId = typeof event.metadata?.suggestionId === "string"
    ? event.metadata.suggestionId
    : null;
  if (suggestionId) {
    await updateSuggestion(
      tenantId,
      suggestionId,
      action === "approved" ? "accepted" : "dismissed"
    );
  }

  const actionPrompt = typeof event.metadata?.actionPrompt === "string"
    ? event.metadata.actionPrompt
    : null;
  if (action === "approved" && actionPrompt) {
    await executeAgentPrompt(tenantId, actionPrompt);
  }

  return { changed: true };
}
